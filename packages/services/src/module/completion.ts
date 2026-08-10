import type { PoolClient } from "pg";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type {
  ModuleAttempt,
  ModuleAttemptStatus,
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
  ATTEMPT_COLUMNS,
  mapAttemptRow,
  type AttemptRow,
} from "@ai-catalyst/services/attempt/internal/rows";
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

// Orchestrates module completion after complete_module: submitAttempt,
// runOfficialValidation, then leave the Attempt at ready_for_review for
// website confirmModuleCompletion — AI is advisor, not gatekeeper.

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

// One read-only query for auto-complete branch and Module 0 setup summary — re-checked under lock before writes.
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

// Founder-visible AI client label from actor.provider (redirect host), not self-declared name.
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

// Module 0 setup summary via founder-scoped save — idempotent if submission already exists.
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

// System events need actor_type='system' — attempt/events hardcodes 'user'.
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

// Lock run_module then attempt; re-verify ready_for_review under lock — founder confirms, not system.
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
 * MCP complete_module: submit + validate, stop at ready_for_review for website confirm.
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

// --- confirmModuleCompletion ---

// programRunModuleId not moduleKey — auth by workspace id, not active context navigation.
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
 * Founder confirms on website — completes module and unlocks next.
 * MCP complete_module stops at ready_for_review so they sign off before advancing.
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
