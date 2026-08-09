import type { PoolClient } from "pg";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type {
  ModuleAttempt,
  ModuleAttemptStartedVia,
  ModuleAttemptStatus,
  ModuleAttemptType,
  ModuleCompletionMode,
  ModuleType,
} from "@ai-catalyst/shared";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import { resolveFounderWorkspace } from "@ai-catalyst/services/workspace";
import { parseEntityIdOrNotFound } from "@ai-catalyst/services/internal/entity-id";
import { insertModuleEventRow } from "@ai-catalyst/services/internal/module-events";
import { submitAttempt } from "@ai-catalyst/services/attempt";
import { resolveInteractionProvider } from "@ai-catalyst/services/attempt/internal/interaction-provider";
import {
  getArtifactSubmission,
  runOfficialValidation,
  saveArtifactSubmission,
  type ArtifactServiceDependencies,
} from "@ai-catalyst/services/artifact";
import { renderSetupSummaryMarkdown } from "@ai-catalyst/services/module/internal/setup-summary";
import {
  INTERVIEW_EVIDENCE_ARTIFACT_KEY,
  MODULE_3_KEY,
  MODULE_4_KEY,
  createInterviewActivityFromGuide,
  loadGuideQuestionsForAttempt,
} from "@ai-catalyst/services/interview";

// Orchestrates module completion after a Founder calls complete_module:
// submitAttempt, runOfficialValidation, then leave the Attempt at
// ready_for_review for website confirmModuleCompletion (which unlocks
// the next module for any Founder decision — AI is advisor, not gatekeeper).

const ATTEMPT_COLUMNS = `
  id, program_run_module_id, attempt_number, attempt_type, status,
  based_on_attempt_id, started_via, submitted_at, created_at, updated_at
`;

interface AttemptRow {
  id: string;
  program_run_module_id: string;
  attempt_number: number;
  attempt_type: ModuleAttemptType;
  status: ModuleAttemptStatus;
  based_on_attempt_id: string | null;
  started_via: ModuleAttemptStartedVia;
  submitted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function mapAttemptRow(row: AttemptRow): ModuleAttempt {
  return {
    id: row.id,
    programRunModuleId: row.program_run_module_id,
    attemptNumber: row.attempt_number,
    attemptType: row.attempt_type,
    status: row.status,
    basedOnAttemptId: row.based_on_attempt_id,
    startedVia: row.started_via,
    submittedAt: row.submitted_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

async function loadAttemptRow(
  attemptId: string,
  workspaceId: string,
): Promise<AttemptRow | null> {
  const result = await pool.query<AttemptRow>(
    `select ${ATTEMPT_COLUMNS} from module_attempts where id = $1 and workspace_id = $2`,
    [attemptId, workspaceId],
  );
  return result.rows[0] ?? null;
}

interface CompletionContextRow {
  run_module_id: string;
  module_definition_id: string;
  module_key: string;
  program_run_id: string;
  program_run_branch_id: string;
  sequence_index: number;
  module_type: ModuleType;
  completion_mode: ModuleCompletionMode;
  workspace_name: string;
  venture_name: string;
  program_run_name: string | null;
  run_number: number;
  branch_name: string;
  next_module_title: string | null;
}

// One read-only, no-lock query covering everything both the "does this
// Module auto-complete" branch and (for Module 0 only) the Setup Summary
// renderer need. Re-checked for real under a row lock by
// completeSystemModule/cancelAttemptForPivot before anything is written —
// this is only ever used to decide which branch to take and what to put in
// a system-generated document, never as the basis for a write itself.
async function loadCompletionContext(
  runModuleId: string,
  workspaceId: string,
): Promise<CompletionContextRow | null> {
  const result = await pool.query<CompletionContextRow>(
    `select
       m.id as run_module_id,
       m.module_definition_id,
       d.module_key,
       m.program_run_id,
       m.program_run_branch_id,
       m.sequence_index,
       d.module_type,
       d.completion_mode,
       w.name as workspace_name,
       v.name as venture_name,
       r.name as program_run_name,
       r.run_number,
       b.name as branch_name,
       (
         -- Filtered to module_definitions.status = 'active' so an
         -- archived-but-not-yet-reconciled-out-of-this-Run Module is
         -- never surfaced as "what's next" — see the living-V1 plan's
         -- progression query audit (module_definitions archival must not
         -- leak into this founder-facing string).
         select pnm.title_snapshot
         from program_run_modules pnm
         join module_definitions nd on nd.id = pnm.module_definition_id and nd.status = 'active'
         where pnm.program_run_branch_id = m.program_run_branch_id
           and pnm.sequence_index > m.sequence_index
         order by pnm.sequence_index
         limit 1
       ) as next_module_title
     from program_run_modules m
     join module_definitions d on d.id = m.module_definition_id
     join program_runs r on r.id = m.program_run_id
     join program_run_branches b on b.id = m.program_run_branch_id
     join ventures v on v.id = r.venture_id
     join workspaces w on w.id = m.workspace_id
     where m.id = $1 and m.workspace_id = $2`,
    [runModuleId, workspaceId],
  );
  return result.rows[0] ?? null;
}

// Founder-visible: this string is written into the Setup Summary's
// "AI client:" line, so it has to name the assistant the Founder actually
// connected. `actor.provider` is derived from the OAuth client's registered
// redirect host, not from self-declared client_name, so it is safe to
// display. Unlike the enum columns (module_responses.source_provider et al,
// which only accept website/claude/openai), this is free text, so "other"
// — a legitimately registered third client — gets an honest generic label
// rather than being forced into one of the two known brands.
function resolveAiClientLabel(actor: ActorContext): string {
  if (actor.source === "web") {
    return "Founder Toolkit (Web)";
  }
  switch (actor.provider) {
    case "claude":
      return "Claude (Remote MCP)";
    case "openai":
      return "ChatGPT (Remote MCP)";
    default:
      return "AI assistant (Remote MCP)";
  }
}

/**
 * Module 4 completion requires the exact pinned interview-evidence
 * snapshot for *this* attempt — not confirmed-but-unpinned activity
 * evidence, and not a pin from another attempt.
 */
async function assertModule4PinnedInterviewEvidence(
  workspaceId: string,
  attemptId: string,
  programRunId: string,
): Promise<void> {
  const pinResult = await pool.query<{
    source_interview_evidence_artifact_id: string | null;
    pin_attempt_id: string | null;
    artifact_key: string | null;
    pin_program_run_id: string | null;
  }>(
    `select
       a.source_interview_evidence_artifact_id,
       s.module_attempt_id as pin_attempt_id,
       d.artifact_key,
       m.program_run_id as pin_program_run_id
     from module_attempts a
     left join artifact_submissions s
       on s.id = a.source_interview_evidence_artifact_id
      and s.workspace_id = a.workspace_id
     left join artifact_definitions d
       on d.id = s.artifact_definition_id
     left join program_run_modules m
       on m.id = a.program_run_module_id
      and m.workspace_id = a.workspace_id
     where a.id = $1 and a.workspace_id = $2`,
    [attemptId, workspaceId],
  );
  const row = pinResult.rows[0];
  if (
    !row?.source_interview_evidence_artifact_id ||
    row.pin_attempt_id !== attemptId ||
    row.artifact_key !== INTERVIEW_EVIDENCE_ARTIFACT_KEY ||
    row.pin_program_run_id !== programRunId
  ) {
    throw new ServiceError(
      "MODULE_4_INTERVIEW_EVIDENCE_MISSING",
      "Module 4 cannot complete without the interview-evidence snapshot pinned on this attempt.",
    );
  }
}

// Module 0's Setup Summary Artifact is system-generated, not
// Founder-authored, but it is still saved via the founder-scoped
// saveArtifactSubmission (not a synthetic system actor) — that function's
// own resolveSubmissionCreatedVia only supports the two source values a
// `assertRole(actor, ["founder"])` caller can ever have (web/mcp), and
// there is no product need for `created_via = 'system'` here: the
// Founder's own complete_module call (via web or Claude) is what caused
// this Artifact to be written, which is exactly what created_via already
// records for every other Artifact.
//
// Idempotent by construction: only renders and saves when this Attempt has
// no submission for the Artifact yet, so a retried completeModuleAttempt
// call (e.g. after submitAttempt or runOfficialValidation failed
// transiently) never re-renders with a fresh checkedAtIso and creates a
// second Version — see setup-summary.ts's own comment on why this
// document can't describe its own hash.
async function ensureSetupSummarySubmission(
  actor: ActorContext,
  attemptId: string,
  moduleDefinitionId: string,
  context: CompletionContextRow,
): Promise<void> {
  const requiredArtifactsResult = await pool.query<{ artifact_key: string }>(
    `select artifact_key from artifact_definitions
     where module_definition_id = $1 and is_required = true and status <> 'archived'
     order by sequence_index`,
    [moduleDefinitionId],
  );

  const programRunLabel = context.program_run_name
    ? `${context.program_run_name} (Run #${context.run_number})`
    : `Run #${context.run_number}`;

  for (const { artifact_key: artifactKey } of requiredArtifactsResult.rows) {
    const existing = await getArtifactSubmission(actor, {
      attemptId,
      artifactKey,
    });
    if (existing) {
      continue;
    }
    const content = renderSetupSummaryMarkdown({
      workspaceName: context.workspace_name,
      ventureName: context.venture_name,
      programRunLabel,
      branchName: context.branch_name,
      aiClientLabel: resolveAiClientLabel(actor),
      checkedAtIso: new Date().toISOString(),
      storageVerified: true,
      nextModuleTitle: context.next_module_title,
    });
    await saveArtifactSubmission(actor, { attemptId, artifactKey, content });
  }
}

type CompletionEventType =
  | "attempt_accepted"
  | "module_completed"
  | "module_unlocked"
  | "attempt_cancelled";

// Deliberately its own event writer, not a reuse of attempt/index.ts's
// private insertModuleEvent (which hardcodes actor_type = 'user') — the
// system-completion branch below needs actor_type = 'system' for an
// actor whose source has been forced to 'system', which that hardcode
// cannot express.
async function insertCompletionEvent(
  client: PoolClient,
  input: {
    workspaceId: string;
    programRunId: string;
    programRunBranchId: string;
    programRunModuleId: string;
    moduleAttemptId: string | null;
    eventType: CompletionEventType;
    actor: ActorContext;
    fromStatus?: string | null;
    toStatus?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const actorType = input.actor.source === "system" ? "system" : "user";
  await insertModuleEventRow(client, {
    workspaceId: input.workspaceId,
    programRunId: input.programRunId,
    programRunBranchId: input.programRunBranchId,
    programRunModuleId: input.programRunModuleId,
    moduleAttemptId: input.moduleAttemptId,
    eventType: input.eventType,
    actorType,
    actorUserId: input.actor.userId,
    sourceProvider: resolveInteractionProvider(input.actor),
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    metadata: input.metadata,
    actor: input.actor,
  });
}

interface RunModuleLockRow {
  id: string;
  program_run_id: string;
  program_run_branch_id: string;
  sequence_index: number;
  status: string;
  active_attempt_id: string | null;
}

export interface NextModuleUnlocked {
  id: string;
  moduleKey: string;
  title: string;
}

// Locks program_run_modules FIRST, then module_attempts — same
// lock-ordering convention as attempt/index.ts. The Attempt must already
// be at 'ready_for_review' (put there by runOfficialValidation); this
// re-verifies that under the lock rather than trusting the caller's
// now-stale read.
//
// `actor` is the Founder confirming their own output, not a system
// actor: this is a deliberate human action, and the events and
// accepted_by/completed_by columns record who took it.
async function completeSystemModule(
  client: PoolClient,
  actor: ActorContext,
  workspaceId: string,
  runModuleId: string,
  attemptId: string,
): Promise<NextModuleUnlocked | null> {
  const runModuleResult = await client.query<RunModuleLockRow>(
    `select id, program_run_id, program_run_branch_id, sequence_index, status, active_attempt_id
     from program_run_modules
     where id = $1 and workspace_id = $2
     for update`,
    [runModuleId, workspaceId],
  );
  const runModule = runModuleResult.rows[0];
  if (!runModule) {
    throw new ServiceError("NOT_FOUND", "Module not found.");
  }
  if (runModule.status !== "in_progress") {
    throw new ServiceError(
      "INTERNAL_INVARIANT_ERROR",
      `program_run_module ${runModule.id} is "${runModule.status}", expected "in_progress".`,
    );
  }

  const attemptResult = await client.query<{
    id: string;
    status: ModuleAttemptStatus;
  }>(
    `select id, status from module_attempts where id = $1 and program_run_module_id = $2 for update`,
    [attemptId, runModule.id],
  );
  const attempt = attemptResult.rows[0];
  if (!attempt) {
    throw new ServiceError("NOT_FOUND", "Attempt not found.");
  }
  if (attempt.status !== "ready_for_review") {
    throw new ServiceError(
      "INTERNAL_INVARIANT_ERROR",
      `Attempt ${attempt.id} is "${attempt.status}", expected "ready_for_review" after a passing official validation.`,
    );
  }

  await client.query(
    `update module_attempts
     set status = 'accepted', accepted_at = now(), accepted_by_user_id = $2, updated_at = now()
     where id = $1`,
    [attempt.id, actor.userId],
  );

  await client.query(
    `update program_run_modules
     set status = 'completed', completed_at = now(), completed_by_user_id = $3,
         accepted_attempt_id = $1, active_attempt_id = null, updated_at = now()
     where id = $2`,
    [attempt.id, runModule.id, actor.userId],
  );

  await insertCompletionEvent(client, {
    workspaceId,
    programRunId: runModule.program_run_id,
    programRunBranchId: runModule.program_run_branch_id,
    programRunModuleId: runModule.id,
    moduleAttemptId: attempt.id,
    eventType: "attempt_accepted",
    actor,
    fromStatus: "ready_for_review",
    toStatus: "accepted",
  });
  await insertCompletionEvent(client, {
    workspaceId,
    programRunId: runModule.program_run_id,
    programRunBranchId: runModule.program_run_branch_id,
    programRunModuleId: runModule.id,
    moduleAttemptId: attempt.id,
    eventType: "module_completed",
    actor,
    fromStatus: runModule.status,
    toStatus: "completed",
  });

  // Joined to module_definitions.status = 'active' so a Module whose
  // definition has been archived (removed from the living content
  // constants) is never treated as "next" here — it must neither be
  // unlocked nor block the *following* still-active Module from being
  // found. This is the same "archived definitions exit the active
  // progression chain" invariant reconcileRunModules enforces when it
  // moves an orphaned row's sequence_index past every active Module's;
  // this query is the other half of that invariant, on the read side.
  const nextModuleResult = await client.query<{
    id: string;
    module_key: string;
    title_snapshot: string;
    status: string;
  }>(
    `select pnm.id, pnm.module_key, pnm.title_snapshot, pnm.status
     from program_run_modules pnm
     join module_definitions nd on nd.id = pnm.module_definition_id and nd.status = 'active'
     where pnm.program_run_branch_id = $1 and pnm.sequence_index > $2
     order by pnm.sequence_index
     limit 1
     for update of pnm`,
    [runModule.program_run_branch_id, runModule.sequence_index],
  );
  const nextModule = nextModuleResult.rows[0];
  // No next (active-definition) Module (this was the last one, or every
  // Module after it has been archived), or it's already
  // available/in_progress/completed/inherited from an earlier run of this
  // same completion (idempotent replay) — either way, nothing to unlock.
  if (!nextModule || nextModule.status !== "locked") {
    return null;
  }

  await client.query(
    `update program_run_modules
     set status = 'available', unlocked_at = now(), updated_at = now()
     where id = $1`,
    [nextModule.id],
  );

  await insertCompletionEvent(client, {
    workspaceId,
    programRunId: runModule.program_run_id,
    programRunBranchId: runModule.program_run_branch_id,
    programRunModuleId: nextModule.id,
    moduleAttemptId: null,
    eventType: "module_unlocked",
    actor,
    fromStatus: "locked",
    toStatus: "available",
    metadata: { unlocked_module_key: nextModule.module_key },
  });

  return {
    id: nextModule.id,
    moduleKey: nextModule.module_key,
    title: nextModule.title_snapshot,
  };
}

function normalizeCompleteModuleAttemptInput(input: unknown): {
  attemptId: string;
} {
  if (typeof input !== "object" || input === null || !("attemptId" in input)) {
    throw new ServiceError("VALIDATION_ERROR", "attemptId is required.");
  }
  const { attemptId } = input as { attemptId: unknown };
  if (typeof attemptId !== "string" || attemptId.trim().length === 0) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "attemptId must be a non-blank string.",
    );
  }
  return { attemptId };
}

export interface ModuleValidationError {
  key: string;
  message: string;
}

export interface CompleteModuleAttemptResult {
  attempt: ModuleAttempt;
  passed: boolean;
  // Mirrors RunOfficialValidationResult's own field — required Artifacts
  // with no submission at all. Always [] once passed is true.
  missingArtifactKeys: string[];
  // Failed official-validation checks (and missing-artifact keys) so the
  // AI client can repair named gaps. Always [] once passed is true.
  validationErrors: ModuleValidationError[];
  // True only when the Module is already at
  // program_run_modules.status = 'completed' — which, since Founder
  // confirmation became a required step, only happens on the idempotent
  // replay of an already-confirmed Attempt. A first successful pass
  // through this function now leaves the Module awaiting confirmation
  // instead.
  moduleCompleted: boolean;
  // Set only when this call itself completed the Module, which is now
  // exclusively confirmModuleCompletion's job. Kept on this result so an
  // idempotent replay can still report what happened.
  nextModuleUnlocked: NextModuleUnlocked | null;
  // True once validation has passed and the Attempt is sitting at
  // 'ready_for_review', waiting for the Founder to confirm the output on
  // the website. This is the normal terminal state of a successful
  // `complete_module` call from MCP.
  awaitingConfirmation: boolean;
}

function collectValidationErrors(
  missingArtifactKeys: string[],
  validations: Awaited<ReturnType<typeof runOfficialValidation>>["validations"],
): ModuleValidationError[] {
  const errors: ModuleValidationError[] = missingArtifactKeys.map((key) => ({
    key: `missing_artifact:${key}`,
    message: `Required artifact "${key}" was never saved.`,
  }));
  for (const validation of validations) {
    for (const check of validation.checks) {
      if (!check.passed) {
        errors.push({
          key: check.key,
          message: check.message ?? `Check "${check.key}" failed.`,
        });
      }
    }
    for (const issue of validation.issues) {
      if (!errors.some((error) => error.message === issue)) {
        errors.push({ key: "validation_issue", message: issue });
      }
    }
  }
  return errors;
}

/**
 * Orchestrates the full "Founder is done with this Attempt" flow behind
 * the MCP `complete_module` tool: submitAttempt + runOfficialValidation,
 * then leave the Attempt at ready_for_review for website confirmation.
 *
 * Idempotency: an already-`accepted` Attempt short-circuits immediately.
 * Other repeat-call shapes are idempotent via submitAttempt /
 * runOfficialValidation short-circuits. Proceed / Pivot / Kill all share
 * the same success path — the Founder's decision does not auto-cancel or
 * start a Retry Attempt.
 */
export async function completeModuleAttempt(
  actor: ActorContext,
  input: unknown,
  // Test-only DI seam, forwarded to runOfficialValidation only (same
  // pattern as ArtifactServiceDependencies' own callers) — lets
  // completion.db.test.ts register a fixture Validator without touching
  // the real content's registrations in
  // artifact/internal/validators/registry.ts.
  deps: ArtifactServiceDependencies = {},
): Promise<CompleteModuleAttemptResult> {
  assertRole(actor, ["founder"]);
  const normalized = normalizeCompleteModuleAttemptInput(input);
  const attemptId = parseEntityIdOrNotFound(
    normalized.attemptId,
    "Attempt not found.",
  );
  const workspace = await resolveFounderWorkspace(actor);

  const initialAttempt = await loadAttemptRow(attemptId, workspace.id);
  if (!initialAttempt) {
    throw new ServiceError("NOT_FOUND", "Attempt not found.");
  }

  if (initialAttempt.status === "accepted") {
    return {
      attempt: mapAttemptRow(initialAttempt),
      passed: true,
      missingArtifactKeys: [],
      validationErrors: [],
      moduleCompleted: true,
      nextModuleUnlocked: null,
      awaitingConfirmation: false,
    };
  }

  const context = await loadCompletionContext(
    initialAttempt.program_run_module_id,
    workspace.id,
  );
  if (!context) {
    throw new ServiceError(
      "INTERNAL_INVARIANT_ERROR",
      `Attempt ${attemptId} has no owning program_run_module.`,
    );
  }

  if (context.module_type === "setup") {
    await ensureSetupSummarySubmission(
      actor,
      attemptId,
      context.module_definition_id,
      context,
    );
  }

  if (context.module_key === MODULE_4_KEY) {
    await assertModule4PinnedInterviewEvidence(
      workspace.id,
      attemptId,
      context.program_run_id,
    );
  }

  await submitAttempt(actor, { attemptId });

  // Only runOfficialValidation itself needs `source: 'system'` (its own
  // assertOfficialValidationAuthority requires it). Accepting and
  // unlocking remain confirmModuleCompletion's job on the website.
  const systemActor: ActorContext = { ...actor, source: "system" };
  const validation = await runOfficialValidation(
    systemActor,
    { attemptId },
    deps,
  );

  if (!validation.passed) {
    const attemptRow = await loadAttemptRow(attemptId, workspace.id);
    if (!attemptRow) {
      throw new ServiceError(
        "INTERNAL_INVARIANT_ERROR",
        `Attempt ${attemptId} disappeared mid-flight.`,
      );
    }
    return {
      attempt: mapAttemptRow(attemptRow),
      passed: false,
      missingArtifactKeys: validation.missingArtifactKeys,
      validationErrors: collectValidationErrors(
        validation.missingArtifactKeys,
        validation.validations,
      ),
      moduleCompleted: false,
      nextModuleUnlocked: null,
      awaitingConfirmation: false,
    };
  }

  // Deliberately stops here rather than completing the Module.
  // Unlocking is an explicit Founder action on the website
  // (confirmModuleCompletion); this call leaves the Attempt at
  // 'ready_for_review' for them to confirm — for both system and
  // non-system completion modes, and for any Founder decision.
  const attemptRow = await loadAttemptRow(attemptId, workspace.id);
  if (!attemptRow) {
    throw new ServiceError(
      "INTERNAL_INVARIANT_ERROR",
      `Attempt ${attemptId} disappeared mid-flight.`,
    );
  }
  return {
    attempt: mapAttemptRow(attemptRow),
    passed: true,
    missingArtifactKeys: [],
    validationErrors: [],
    moduleCompleted: false,
    nextModuleUnlocked: null,
    awaitingConfirmation: true,
  };
}

// ---------------------------------------------------------------------
// confirmModuleCompletion — the website's half of module completion.
// ---------------------------------------------------------------------

// Takes programRunModuleId (not moduleKey) so the target is resolved by id
// within the caller's workspace — active context is navigation, not auth.
function normalizeConfirmInput(input: unknown): { programRunModuleId: string } {
  if (
    typeof input !== "object" ||
    input === null ||
    !("programRunModuleId" in input)
  ) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "programRunModuleId is required.",
    );
  }
  const { programRunModuleId } = input as { programRunModuleId: unknown };
  if (
    typeof programRunModuleId !== "string" ||
    programRunModuleId.trim().length === 0
  ) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "programRunModuleId must be a non-blank string.",
    );
  }
  return { programRunModuleId };
}

export interface ConfirmModuleCompletionResult {
  programRunModuleId: string;
  // False only on the idempotent replay path, where the Module was
  // already completed before this call.
  justConfirmed: boolean;
  nextModuleUnlocked: NextModuleUnlocked | null;
}

/**
 * The Founder confirming, on the website, that they are happy with what a
 * Module produced — which is what actually completes it and unlocks the
 * next one.
 *
 * This exists because `complete_module` (MCP) deliberately stops at
 * `ready_for_review`. Letting the AI client both produce the output and
 * declare it good would take the Founder out of their own programme: they
 * could be three modules deep without ever having looked at what was
 * written in their name. So the AI does the work, and the person whose
 * business it is signs it off.
 *
 * Not a review in the PR 4.2 sense — that is a Mentor judging the content
 * and is still to come. This is the Founder acknowledging their own
 * output, so `accepted_by_user_id` is the Founder themselves.
 *
 * Idempotent: confirming an already-completed Module returns the current
 * state rather than erroring, so a double-click or a stale tab can't
 * produce a confusing failure.
 */
export async function confirmModuleCompletion(
  actor: ActorContext,
  input: unknown,
): Promise<ConfirmModuleCompletionResult> {
  assertRole(actor, ["founder"]);
  const { programRunModuleId: rawId } = normalizeConfirmInput(input);
  const programRunModuleId = parseEntityIdOrNotFound(
    rawId,
    "Module not found.",
  );
  const workspace = await resolveFounderWorkspace(actor);

  const runModuleResult = await pool.query<{
    id: string;
    status: string;
    active_attempt_id: string | null;
  }>(
    `select id, status, active_attempt_id
     from program_run_modules
     where id = $1 and workspace_id = $2`,
    [programRunModuleId, workspace.id],
  );
  const runModule = runModuleResult.rows[0];
  if (!runModule) {
    throw new ServiceError("NOT_FOUND", "Module not found.");
  }

  if (runModule.status === "completed") {
    return {
      programRunModuleId,
      justConfirmed: false,
      nextModuleUnlocked: null,
    };
  }

  if (!runModule.active_attempt_id) {
    throw new ServiceError(
      "MODULE_NOT_READY_FOR_CONFIRMATION",
      "There's nothing to confirm on this module yet.",
    );
  }

  const attempt = await loadAttemptRow(
    runModule.active_attempt_id,
    workspace.id,
  );
  if (!attempt) {
    throw new ServiceError("NOT_FOUND", "Attempt not found.");
  }
  if (attempt.status !== "ready_for_review") {
    throw new ServiceError(
      "MODULE_NOT_READY_FOR_CONFIRMATION",
      "This module's output hasn't passed its checks yet, so there's nothing to confirm.",
    );
  }

  // Defense in depth: ready_for_review should already imply every required
  // Artifact exists, but never complete/unlock when a required output is
  // still missing on this attempt (e.g. stale UI / raced state).
  const missingRequired = await pool.query<{ artifact_key: string }>(
    `select d.artifact_key
     from artifact_definitions d
     join program_run_modules m
       on m.module_definition_id = d.module_definition_id
      and m.workspace_id = $2
     where m.id = $1
       and d.is_required = true
       and d.status <> 'archived'
       and not exists (
         select 1
         from artifact_submissions s
         where s.module_attempt_id = $3
           and s.artifact_definition_id = d.id
           and s.status not in ('superseded', 'deleted')
       )
     order by d.sequence_index`,
    [programRunModuleId, workspace.id, attempt.id],
  );
  if (missingRequired.rows.length > 0) {
    throw new ServiceError(
      "MODULE_NOT_READY_FOR_CONFIRMATION",
      "This module is missing a required document, so there's nothing to confirm yet.",
    );
  }

  // Snapshot Module 3 interview questions before the txn so we can create
  // interview_activities inside the same commit as module completion.
  const moduleKeyResult = await pool.query<{
    module_key: string;
    program_run_id: string;
  }>(
    `select module_key, program_run_id
     from program_run_modules
     where id = $1 and workspace_id = $2`,
    [programRunModuleId, workspace.id],
  );
  const completingModule = moduleKeyResult.rows[0];
  const guideQuestions =
    completingModule?.module_key === MODULE_3_KEY
      ? await loadGuideQuestionsForAttempt(actor, attempt.id)
      : null;

  const client = await pool.connect();
  let nextModuleUnlocked: NextModuleUnlocked | null = null;
  try {
    await client.query("begin");
    nextModuleUnlocked = await completeSystemModule(
      client,
      actor,
      workspace.id,
      runModule.id,
      attempt.id,
    );
    if (completingModule?.module_key === MODULE_3_KEY && guideQuestions) {
      await createInterviewActivityFromGuide({
        client,
        workspaceId: workspace.id,
        programRunId: completingModule.program_run_id,
        sourceModuleAttemptId: attempt.id,
        questions: guideQuestions,
      });
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  return { programRunModuleId, justConfirmed: true, nextModuleUnlocked };
}
