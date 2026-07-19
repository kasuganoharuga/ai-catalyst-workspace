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
import {
  startOrResumeAttempt,
  submitAttempt,
} from "@ai-catalyst/services/attempt";
import { resolveInteractionProvider } from "@ai-catalyst/services/attempt/internal/interaction-provider";
import {
  getArtifactSubmission,
  runOfficialValidation,
  saveArtifactSubmission,
  type ArtifactServiceDependencies,
} from "@ai-catalyst/services/artifact";
import { renderSetupSummaryMarkdown } from "@ai-catalyst/services/module/internal/setup-summary";

// Orchestrates module completion after a Founder calls complete_module:
// submitAttempt, runOfficialValidation, and module-specific follow-ups:
//   1. system completion_mode (Module 0): auto-accept and unlock on pass.
//   2. Pivot decision (Module 1): start a retry Attempt automatically.
// Proceed/Kill stay at ready_for_review until a Mentor decision (future).

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
         select title_snapshot from program_run_modules
         where program_run_branch_id = m.program_run_branch_id
           and sequence_index > m.sequence_index
         order by sequence_index
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

function resolveAiClientLabel(actor: ActorContext): string {
  if (actor.source === "web") {
    return "Founder Toolkit (Web)";
  }
  // V1: one MCP AI client — same hardcode as resolveInteractionProvider.
  return "Claude (Remote MCP)";
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
     where module_definition_id = $1 and is_required = true
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

async function loadFinalDecision(attemptId: string): Promise<string | null> {
  const result = await pool.query<{ answer_text: string | null }>(
    `select answer_text from module_responses
     where module_attempt_id = $1 and question_key = 'final_decision'`,
    [attemptId],
  );
  return result.rows[0]?.answer_text ?? null;
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
  },
): Promise<void> {
  const actorType = input.actor.source === "system" ? "system" : "user";
  await client.query(
    `insert into module_events (
       workspace_id, program_run_id, program_run_branch_id, program_run_module_id,
       module_attempt_id, event_type, actor_type, actor_user_id, source_provider
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      input.workspaceId,
      input.programRunId,
      input.programRunBranchId,
      input.programRunModuleId,
      input.moduleAttemptId,
      input.eventType,
      actorType,
      input.actor.userId,
      resolveInteractionProvider(input.actor),
    ],
  );
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
  });
  await insertCompletionEvent(client, {
    workspaceId,
    programRunId: runModule.program_run_id,
    programRunBranchId: runModule.program_run_branch_id,
    programRunModuleId: runModule.id,
    moduleAttemptId: attempt.id,
    eventType: "module_completed",
    actor,
  });

  const nextModuleResult = await client.query<{
    id: string;
    module_key: string;
    title_snapshot: string;
    status: string;
  }>(
    `select id, module_key, title_snapshot, status
     from program_run_modules
     where program_run_branch_id = $1 and sequence_index > $2
     order by sequence_index
     limit 1
     for update`,
    [runModule.program_run_branch_id, runModule.sequence_index],
  );
  const nextModule = nextModuleResult.rows[0];
  // No next Module (this was the last one), or it's already
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
  });

  return {
    id: nextModule.id,
    moduleKey: nextModule.module_key,
    title: nextModule.title_snapshot,
  };
}

// Phase A of Pivot: cancels the Attempt the Founder just pivoted away
// from and clears the Module's active_attempt_id, in its own short
// transaction. Phase B (creating the Retry Attempt) is deliberately a
// separate call to the public startOrResumeAttempt, made only after this
// one has committed — see completion.ts's module-level comment history
// (this two-phase split, not a direct call to attempt/index.ts's private
// insertRetryAttempt, is what keeps a crash between the two phases
// recoverable: the Founder/Claude can always retry by calling
// start_module_attempt directly with the same basedOnAttemptId).
async function cancelAttemptForPivot(
  client: PoolClient,
  actor: ActorContext,
  workspaceId: string,
  runModuleId: string,
  attemptId: string,
): Promise<void> {
  const runModuleResult = await client.query<{
    id: string;
    program_run_id: string;
    program_run_branch_id: string;
  }>(
    `select id, program_run_id, program_run_branch_id
     from program_run_modules
     where id = $1 and workspace_id = $2
     for update`,
    [runModuleId, workspaceId],
  );
  const runModule = runModuleResult.rows[0];
  if (!runModule) {
    throw new ServiceError("NOT_FOUND", "Module not found.");
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
    `update module_attempts set status = 'cancelled', cancelled_at = now(), updated_at = now() where id = $1`,
    [attempt.id],
  );
  await client.query(
    `update program_run_modules set active_attempt_id = null, updated_at = now() where id = $1`,
    [runModule.id],
  );

  await insertCompletionEvent(client, {
    workspaceId,
    programRunId: runModule.program_run_id,
    programRunBranchId: runModule.program_run_branch_id,
    programRunModuleId: runModule.id,
    moduleAttemptId: attempt.id,
    eventType: "attempt_cancelled",
    actor,
  });
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

export interface CompleteModuleAttemptResult {
  attempt: ModuleAttempt;
  passed: boolean;
  // Mirrors RunOfficialValidationResult's own field — required Artifacts
  // with no submission at all. Always [] once passed is true.
  missingArtifactKeys: string[];
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
  // True only on the Pivot branch: the submitted Attempt has been
  // cancelled and `retryAttempt` is the new one the Founder should
  // continue with instead.
  pivoted: boolean;
  retryAttempt: ModuleAttempt | null;
}

/**
 * Orchestrates the full "Founder is done with this Attempt" flow behind
 * the MCP `complete_module` tool. See this file's module-level comment
 * for what it adds on top of submitAttempt/runOfficialValidation, and
 * Module_0_and_Module_1_Workflow_S3.md for the source specification.
 *
 * Idempotency: an already-`accepted` Attempt short-circuits immediately
 * (no re-validation, no re-write). Every other repeat-call shape is
 * idempotent transitively, through the primitives it calls
 * (submitAttempt's own submitted/ready_for_review short-circuit,
 * runOfficialValidation's own ready_for_review/validation_failed
 * short-circuit) — this function adds no further short-circuiting of its
 * own for those, and does not attempt to make a repeat call against an
 * already-`cancelled` (post-Pivot) Attempt idempotent: that Attempt is
 * done, and the caller must resume the Retry Attempt via
 * `start_module_attempt` instead.
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
      moduleCompleted: true,
      nextModuleUnlocked: null,
      awaitingConfirmation: false,
      pivoted: false,
      retryAttempt: null,
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

  await submitAttempt(actor, { attemptId });

  // Only runOfficialValidation itself needs `source: 'system'` (its own
  // assertOfficialValidationAuthority requires it). Nothing else in this
  // function uses a synthetic actor any more: accepting and unlocking
  // moved out to confirmModuleCompletion, where the Founder is the one
  // taking the action, and the Pivot branch below has always used the
  // Founder's own actor because cancelling the pivoted-from Attempt is a
  // direct consequence of their `final_decision` answer.
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
      moduleCompleted: false,
      nextModuleUnlocked: null,
      awaitingConfirmation: false,
      pivoted: false,
      retryAttempt: null,
    };
  }

  if (context.completion_mode === "system") {
    // Deliberately stops here rather than completing the Module.
    //
    // A `completion_mode = 'system'` Module used to auto-accept and
    // unlock the next one the moment validation passed, which meant the
    // whole programme could advance without the Founder ever looking at
    // the website — and without them ever confirming they were happy
    // with what the AI produced. Unlocking is now an explicit Founder
    // action on the website (confirmModuleCompletion); this call leaves
    // the Attempt at 'ready_for_review' for them to confirm.
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
      moduleCompleted: false,
      nextModuleUnlocked: null,
      awaitingConfirmation: true,
      pivoted: false,
      retryAttempt: null,
    };
  }

  // Non-system modules never auto-complete — Mentor decision required.
  // Proceed/Kill stay ready_for_review. Pivot is handled below.
  const finalDecision = await loadFinalDecision(attemptId);
  if (finalDecision !== "pivot") {
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
      moduleCompleted: false,
      nextModuleUnlocked: null,
      awaitingConfirmation: true,
      pivoted: false,
      retryAttempt: null,
    };
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    await cancelAttemptForPivot(
      client,
      actor,
      workspace.id,
      context.run_module_id,
      attemptId,
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  const { attempt: retryAttempt } = await startOrResumeAttempt(actor, {
    programRunModuleId: context.run_module_id,
    basedOnAttemptId: attemptId,
  });

  const cancelledAttemptRow = await loadAttemptRow(attemptId, workspace.id);
  if (!cancelledAttemptRow) {
    throw new ServiceError(
      "INTERNAL_INVARIANT_ERROR",
      `Attempt ${attemptId} disappeared mid-flight.`,
    );
  }

  return {
    attempt: mapAttemptRow(cancelledAttemptRow),
    passed: true,
    missingArtifactKeys: [],
    moduleCompleted: false,
    nextModuleUnlocked: null,
    awaitingConfirmation: false,
    pivoted: true,
    retryAttempt,
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
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  return { programRunModuleId, justConfirmed: true, nextModuleUnlocked };
}
