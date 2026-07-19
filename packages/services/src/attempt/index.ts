import type { PoolClient } from "pg";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type {
  ModuleAttempt,
  ModuleAttemptStartedVia,
  ModuleAttemptStatus,
  ModuleAttemptType,
  ModuleResponse,
  ModuleResponseCapturedVia,
  ModuleResponseStatus,
  ModuleResponseType,
} from "@ai-catalyst/shared";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import { resolveFounderWorkspace } from "@ai-catalyst/services/workspace";
import { parseEntityIdOrNotFound } from "@ai-catalyst/services/internal/entity-id";
import { resolveInteractionProvider } from "@ai-catalyst/services/attempt/internal/interaction-provider";
import { isRetryableAttemptStatus } from "@ai-catalyst/services/attempt/internal/retry";

// This module owns Attempt/Response orchestration for a single Module:
// starting/resuming an Attempt, saving structured answers, and submitting
// for review. Called by apps/web route handlers and apps/mcp tool handlers
// through the same Service functions (no duplicate business logic).
//
// Lock ordering: when a transaction needs both program_run_modules and
// module_attempts rows, lock program_run_modules first, then module_attempts.

const RUN_MODULE_STARTABLE_STATUSES = ["available", "in_progress"] as const;

type RunModuleStatus =
  | "locked"
  | "inherited"
  | "available"
  | "in_progress"
  | "ready_to_unlock"
  | "completed";

interface RunModuleRow {
  id: string;
  program_run_id: string;
  program_run_branch_id: string;
  status: RunModuleStatus;
  active_attempt_id: string | null;
}

// Explicit column list (never `select *`) mapped through mapAttemptRow —
// a future internal-only column added to `module_attempts` is never
// accidentally exposed through the DTO just because a query forgot to
// name its columns.
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

const RESPONSE_COLUMNS = `
  id, module_attempt_id, question_key, sequence_index, question_text_snapshot,
  response_type, response_status, answer_text, answer_data, captured_via, updated_at
`;

interface ResponseRow {
  id: string;
  module_attempt_id: string;
  question_key: string;
  sequence_index: number;
  question_text_snapshot: string;
  response_type: ModuleResponseType;
  response_status: ModuleResponseStatus;
  answer_text: string | null;
  answer_data: unknown;
  captured_via: ModuleResponseCapturedVia;
  updated_at: Date;
}

function mapResponseRow(row: ResponseRow): ModuleResponse {
  return {
    id: row.id,
    moduleAttemptId: row.module_attempt_id,
    questionKey: row.question_key,
    sequenceIndex: row.sequence_index,
    questionTextSnapshot: row.question_text_snapshot,
    responseType: row.response_type,
    responseStatus: row.response_status,
    answerText: row.answer_text,
    answerData: row.answer_data,
    capturedVia: row.captured_via,
    updatedAt: row.updated_at.toISOString(),
  };
}

// Detects the migration's partial unique index by name, never by a bare
// error.code === "23505" check — a raw 23505 could just as easily come
// from an unrelated constraint, which must not be silently reinterpreted
// as ATTEMPT_RETRY_SOURCE_INVALID.
function isUniqueViolation(error: unknown, constraintName: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "23505" &&
    (error as { constraint?: unknown }).constraint === constraintName
  );
}

async function insertModuleEvent(
  client: PoolClient,
  input: {
    workspaceId: string;
    programRunId: string;
    programRunBranchId: string;
    programRunModuleId: string;
    moduleAttemptId: string;
    eventType: "attempt_started" | "retry_started" | "response_saved" | "attempt_submitted";
    actor: ActorContext;
  },
): Promise<void> {
  // module_events is business-state history for Modules/Attempts/
  // Responses (per its own table comment) — a different thing from
  // apps/mcp's mcp_tool_audit_logs, and written directly by the Service
  // inside the same transaction as the state change it records, never as
  // a separate best-effort side channel.
  await client.query(
    `insert into module_events (
       workspace_id, program_run_id, program_run_branch_id, program_run_module_id,
       module_attempt_id, event_type, actor_type, actor_user_id, source_provider
     )
     values ($1, $2, $3, $4, $5, $6, 'user', $7, $8)`,
    [
      input.workspaceId,
      input.programRunId,
      input.programRunBranchId,
      input.programRunModuleId,
      input.moduleAttemptId,
      input.eventType,
      input.actor.userId,
      resolveInteractionProvider(input.actor),
    ],
  );
}

// Runtime validation of untrusted input crossing the API boundary — the
// caller's declared parameter type only describes the happy path.
function normalizeStartOrResumeAttemptInput(input: unknown): {
  programRunModuleId: string;
  basedOnAttemptId: string | null;
} {
  if (
    typeof input !== "object" ||
    input === null ||
    !("programRunModuleId" in input)
  ) {
    throw new ServiceError("VALIDATION_ERROR", "programRunModuleId is required.");
  }

  const { programRunModuleId, basedOnAttemptId } = input as {
    programRunModuleId: unknown;
    basedOnAttemptId?: unknown;
  };

  if (typeof programRunModuleId !== "string" || programRunModuleId.trim().length === 0) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "programRunModuleId must be a non-blank string.",
    );
  }

  if (basedOnAttemptId === undefined || basedOnAttemptId === null) {
    return { programRunModuleId, basedOnAttemptId: null };
  }
  if (typeof basedOnAttemptId !== "string" || basedOnAttemptId.trim().length === 0) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "basedOnAttemptId must be a non-blank string.",
    );
  }

  return { programRunModuleId, basedOnAttemptId };
}

async function insertInitialAttempt(
  client: PoolClient,
  workspaceId: string,
  programRunModuleId: string,
  actor: ActorContext,
): Promise<AttemptRow> {
  const result = await client.query<AttemptRow>(
    `insert into module_attempts (
       workspace_id, program_run_module_id, attempt_number, attempt_type,
       status, based_on_attempt_id, started_by_user_id, started_via
     )
     values ($1, $2, 1, 'initial', 'draft', null, $3, $4)
     returning ${ATTEMPT_COLUMNS}`,
    [workspaceId, programRunModuleId, actor.userId, resolveInteractionProvider(actor)],
  );
  return result.rows[0];
}

// Only reached once the caller (startOrResumeAttempt) already holds the
// program_run_modules row lock — see the module-level lock-ordering
// comment. That lock fully serializes concurrent Retry creation for the
// same Module, so the SELECT-based "already retried" check below is
// race-free in practice; the try/catch around the INSERT is a defensive
// backstop for the migration's `module_attempts_based_on_unique` partial
// unique index (infra/database/migrations/0005_*), not the primary
// mechanism.
async function insertRetryAttempt(
  client: PoolClient,
  workspaceId: string,
  programRunModuleId: string,
  basedOnAttemptId: string,
  actor: ActorContext,
): Promise<AttemptRow> {
  const sourceResult = await client.query<{ id: string; status: ModuleAttemptStatus }>(
    `select id, status from module_attempts
     where id = $1 and program_run_module_id = $2
     for update`,
    [basedOnAttemptId, programRunModuleId],
  );
  const source = sourceResult.rows[0];
  if (!source) {
    throw new ServiceError(
      "ATTEMPT_RETRY_SOURCE_INVALID",
      "basedOnAttemptId does not belong to this Module.",
    );
  }
  if (!isRetryableAttemptStatus(source.status)) {
    throw new ServiceError(
      "ATTEMPT_RETRY_SOURCE_INVALID",
      `Attempt "${source.id}" has status "${source.status}", which cannot be retried.`,
    );
  }

  const alreadyRetriedResult = await client.query<{ id: string }>(
    `select id from module_attempts where based_on_attempt_id = $1`,
    [basedOnAttemptId],
  );
  if (alreadyRetriedResult.rows[0]) {
    throw new ServiceError(
      "ATTEMPT_RETRY_SOURCE_INVALID",
      `Attempt "${source.id}" has already been retried.`,
    );
  }

  try {
    const result = await client.query<AttemptRow>(
      `insert into module_attempts (
         workspace_id, program_run_module_id, attempt_number, attempt_type,
         status, based_on_attempt_id, started_by_user_id, started_via
       )
       values (
         $1, $2,
         (select coalesce(max(attempt_number), 0) + 1 from module_attempts where program_run_module_id = $2),
         'retry', 'draft', $3, $4, $5
       )
       returning ${ATTEMPT_COLUMNS}`,
      [
        workspaceId,
        programRunModuleId,
        basedOnAttemptId,
        actor.userId,
        resolveInteractionProvider(actor),
      ],
    );
    return result.rows[0];
  } catch (error) {
    if (isUniqueViolation(error, "module_attempts_based_on_unique")) {
      throw new ServiceError(
        "ATTEMPT_RETRY_SOURCE_INVALID",
        `Attempt "${basedOnAttemptId}" has already been retried.`,
      );
    }
    throw error;
  }
}

export interface StartOrResumeAttemptResult {
  attempt: ModuleAttempt;
  // true only when this call inserted a brand-new Attempt row (Initial or
  // Retry) — false when an existing draft/in_progress Attempt was found
  // and returned unchanged (the resume path).
  created: boolean;
}

/**
 * Starts a Founder's first Attempt at a Module, or resumes the one
 * currently in progress. Also handles creating a Retry Attempt (based on
 * a failed/rejected prior Attempt) once history exists for this Module.
 *
 * Branch table:
 *  1. program_run_modules.status must be 'available' or 'in_progress' —
 *     otherwise RUN_MODULE_NOT_AVAILABLE.
 *  2. active_attempt_id set (resume): draft/in_progress -> return it;
 *     submitted/ready_for_review -> ATTEMPT_PENDING_REVIEW; any other
 *     status -> INTERNAL_INVARIANT_ERROR (terminal Attempts should have
 *     active_attempt_id cleared elsewhere; this should not happen).
 *  3. active_attempt_id null, no history: basedOnAttemptId absent ->
 *     create Initial; present -> VALIDATION_ERROR (nothing to retry).
 *  4. active_attempt_id null, history exists: basedOnAttemptId absent ->
 *     VALIDATION_ERROR (must name a retry source, never silently assumes
 *     attempt_number 2 / attempt_type 'initial' — that would violate
 *     module_attempts_type_check); present -> Retry creation path.
 */
export async function startOrResumeAttempt(
  actor: ActorContext,
  input: unknown,
): Promise<StartOrResumeAttemptResult> {
  assertRole(actor, ["founder"]);
  const normalized = normalizeStartOrResumeAttemptInput(input);
  const runModuleId = parseEntityIdOrNotFound(
    normalized.programRunModuleId,
    "Module not found.",
  );
  const basedOnAttemptId =
    normalized.basedOnAttemptId === null
      ? null
      : parseEntityIdOrNotFound(normalized.basedOnAttemptId, "Attempt not found.");

  const client = await pool.connect();
  try {
    await client.query("begin");
    const workspace = await resolveFounderWorkspace(actor, client);

    // Locks the program_run_modules row for the rest of this transaction
    // — per the module-level lock-ordering comment, always the first lock
    // taken. Scoped by workspace_id: a run_module belonging to another
    // Workspace is indistinguishable from one that doesn't exist.
    const runModuleResult = await client.query<RunModuleRow>(
      `select id, program_run_id, program_run_branch_id, status, active_attempt_id
       from program_run_modules
       where id = $1 and workspace_id = $2
       for update`,
      [runModuleId, workspace.id],
    );
    const runModule = runModuleResult.rows[0];
    if (!runModule) {
      throw new ServiceError("NOT_FOUND", "Module not found.");
    }

    if (
      !(RUN_MODULE_STARTABLE_STATUSES as readonly RunModuleStatus[]).includes(
        runModule.status,
      )
    ) {
      throw new ServiceError(
        "RUN_MODULE_NOT_AVAILABLE",
        `Module is "${runModule.status}" and cannot be started or resumed.`,
      );
    }

    if (runModule.active_attempt_id) {
      const activeResult = await client.query<AttemptRow>(
        `select ${ATTEMPT_COLUMNS} from module_attempts
         where id = $1 and program_run_module_id = $2
         for update`,
        [runModule.active_attempt_id, runModule.id],
      );
      const active = activeResult.rows[0];
      if (!active) {
        throw new ServiceError(
          "INTERNAL_INVARIANT_ERROR",
          `program_run_module ${runModule.id}'s active_attempt_id points to a non-existent Attempt.`,
        );
      }

      if (active.status === "draft" || active.status === "in_progress") {
        if (basedOnAttemptId !== null && active.based_on_attempt_id !== basedOnAttemptId) {
          throw new ServiceError(
            "VALIDATION_ERROR",
            "basedOnAttemptId does not match the currently active Attempt's based_on_attempt_id.",
          );
        }
        await client.query("commit");
        return { attempt: mapAttemptRow(active), created: false };
      }

      if (active.status === "submitted" || active.status === "ready_for_review") {
        throw new ServiceError(
          "ATTEMPT_PENDING_REVIEW",
          `Attempt ${active.id} is "${active.status}" and is awaiting review.`,
        );
      }

      // accepted / rejected / validation_failed / cancelled still
      // referenced by active_attempt_id — clearing that pointer on a
      // terminal Attempt is handled elsewhere; this combination should
      // not occur in normal operation.
      throw new ServiceError(
        "INTERNAL_INVARIANT_ERROR",
        `program_run_module ${runModule.id}'s active_attempt_id points to Attempt ${active.id}, which is in terminal status "${active.status}".`,
      );
    }

    const historyResult = await client.query<{ count: string }>(
      `select count(*) as count from module_attempts where program_run_module_id = $1`,
      [runModule.id],
    );
    const hasHistory = Number(historyResult.rows[0].count) > 0;

    let newAttempt: AttemptRow;
    let eventType: "attempt_started" | "retry_started";

    if (!hasHistory) {
      if (basedOnAttemptId !== null) {
        throw new ServiceError(
          "VALIDATION_ERROR",
          "basedOnAttemptId was provided, but this Module has no prior Attempts to retry.",
        );
      }
      newAttempt = await insertInitialAttempt(client, workspace.id, runModule.id, actor);
      eventType = "attempt_started";
    } else {
      if (basedOnAttemptId === null) {
        throw new ServiceError(
          "VALIDATION_ERROR",
          "basedOnAttemptId is required to retry a Module that already has prior Attempts.",
        );
      }
      newAttempt = await insertRetryAttempt(
        client,
        workspace.id,
        runModule.id,
        basedOnAttemptId,
        actor,
      );
      eventType = "retry_started";
    }

    // 'available' -> 'in_progress' on the Initial path; already
    // 'in_progress' on the Retry path (Retry only reachable once
    // run_module has already been started once) — the `case` leaves any
    // other startable status (there is none besides these two) untouched
    // rather than assuming which path just ran.
    await client.query(
      `update program_run_modules
       set status = case when status = 'available' then 'in_progress' else status end,
           active_attempt_id = $1,
           started_at = coalesce(started_at, now()),
           updated_at = now()
       where id = $2`,
      [newAttempt.id, runModule.id],
    );

    await insertModuleEvent(client, {
      workspaceId: workspace.id,
      programRunId: runModule.program_run_id,
      programRunBranchId: runModule.program_run_branch_id,
      programRunModuleId: runModule.id,
      moduleAttemptId: newAttempt.id,
      eventType,
      actor,
    });

    await client.query("commit");
    return { attempt: mapAttemptRow(newAttempt), created: true };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

interface QuestionRow {
  question_key: string;
  sequence_index: number;
  question_text: string;
  response_type: ModuleResponseType;
  allow_skip: boolean;
  options: unknown;
  conditions: unknown;
}

interface ParsedQuestionCondition {
  depends_on: string;
  operator: "equals";
  value: unknown;
}

// An empty `{}` (module_questions.conditions' default) is not a condition
// at all — only a well-formed `{ depends_on, operator: "equals", value }`
// object counts as "this question has conditions".
function parseNonEmptyConditions(conditions: unknown): ParsedQuestionCondition | null {
  if (typeof conditions !== "object" || conditions === null) {
    return null;
  }
  if (Object.keys(conditions).length === 0) {
    return null;
  }
  const { depends_on, operator, value } = conditions as {
    depends_on?: unknown;
    operator?: unknown;
    value?: unknown;
  };
  if (typeof depends_on !== "string" || operator !== "equals") {
    return null;
  }
  return { depends_on, operator, value };
}

function optionsInclude(options: unknown, value: string): boolean {
  if (!Array.isArray(options)) {
    return false;
  }
  return options.some(
    (option) =>
      typeof option === "object" &&
      option !== null &&
      (option as { value?: unknown }).value === value,
  );
}

// Reads the CURRENT answer of `condition.depends_on` within this same
// Attempt. A dependency that hasn't been answered at all yet is treated
// as "condition not currently satisfied" — this is what lets a Founder
// mark a not-yet-relevant question `not_applicable` before answering its
// dependency, rather than being forced to answer things out of order.
async function evaluateConditionCurrentlyHolds(
  client: PoolClient,
  attemptId: string,
  condition: ParsedQuestionCondition,
): Promise<boolean> {
  const dependencyResult = await client.query<{
    answer_text: string | null;
    answer_data: unknown;
  }>(
    `select answer_text, answer_data from module_responses
     where module_attempt_id = $1 and question_key = $2`,
    [attemptId, condition.depends_on],
  );
  const dependencyRow = dependencyResult.rows[0];
  if (!dependencyRow) {
    return false;
  }
  const actualValue = dependencyRow.answer_text ?? dependencyRow.answer_data;
  return actualValue === condition.value;
}

// Validates `value`/`responseStatus` against the question's rules and
// returns the `answer_text` to store. Structured answer data is not used
// for short_text, long_text, and single_choice — answer_data stays null.
async function resolveAnswerText(
  client: PoolClient,
  attemptId: string,
  question: QuestionRow,
  responseStatus: ModuleResponseStatus,
  value: unknown,
): Promise<string | null> {
  switch (responseStatus) {
    case "answered": {
      if (question.response_type === "short_text" || question.response_type === "long_text") {
        if (typeof value !== "string" || value.trim().length === 0) {
          throw new ServiceError(
            "VALIDATION_ERROR",
            `Question "${question.question_key}" requires a non-empty text answer.`,
          );
        }
        return value;
      }
      if (question.response_type === "single_choice") {
        if (typeof value !== "string" || !optionsInclude(question.options, value)) {
          throw new ServiceError(
            "VALIDATION_ERROR",
            `Question "${question.question_key}" requires a value matching one of its options.`,
          );
        }
        return value;
      }
      throw new ServiceError(
        "VALIDATION_ERROR",
        `Response type "${question.response_type}" is not supported by saveFounderResponse yet.`,
      );
    }
    case "skipped": {
      if (!question.allow_skip) {
        throw new ServiceError(
          "VALIDATION_ERROR",
          `Question "${question.question_key}" does not allow skipping.`,
        );
      }
      return null;
    }
    case "not_applicable": {
      const condition = parseNonEmptyConditions(question.conditions);
      if (!condition) {
        throw new ServiceError(
          "VALIDATION_ERROR",
          `Question "${question.question_key}" has no conditions, so it cannot be marked not_applicable.`,
        );
      }
      const currentlyHolds = await evaluateConditionCurrentlyHolds(client, attemptId, condition);
      if (currentlyHolds) {
        throw new ServiceError(
          "VALIDATION_ERROR",
          `Question "${question.question_key}"'s condition currently holds, so it cannot be marked not_applicable.`,
        );
      }
      return null;
    }
    case "needs_follow_up": {
      // An explicitly incomplete/flagged state, not a final answer — no
      // answered-type validation against value.
      return typeof value === "string" ? value : null;
    }
    default: {
      const _exhaustive: never = responseStatus;
      return _exhaustive;
    }
  }
}

function normalizeSaveFounderResponseInput(input: unknown): {
  attemptId: string;
  questionKey: string;
  responseStatus: ModuleResponseStatus;
  value: unknown;
} {
  if (
    typeof input !== "object" ||
    input === null ||
    !("attemptId" in input) ||
    !("questionKey" in input)
  ) {
    throw new ServiceError("VALIDATION_ERROR", "attemptId and questionKey are required.");
  }

  const { attemptId, questionKey, responseStatus, value } = input as {
    attemptId: unknown;
    questionKey: unknown;
    responseStatus?: unknown;
    value?: unknown;
  };

  if (typeof attemptId !== "string" || attemptId.trim().length === 0) {
    throw new ServiceError("VALIDATION_ERROR", "attemptId must be a non-blank string.");
  }
  if (typeof questionKey !== "string" || questionKey.trim().length === 0) {
    throw new ServiceError("VALIDATION_ERROR", "questionKey must be a non-blank string.");
  }

  const normalizedStatus = responseStatus === undefined ? "answered" : responseStatus;
  if (
    normalizedStatus !== "answered" &&
    normalizedStatus !== "skipped" &&
    normalizedStatus !== "not_applicable" &&
    normalizedStatus !== "needs_follow_up"
  ) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      `Invalid responseStatus "${String(normalizedStatus)}".`,
    );
  }

  return { attemptId, questionKey, responseStatus: normalizedStatus, value };
}

/**
 * Saves (or updates) a Founder's answer to one Question within an Attempt.
 * Upserts on the `(module_attempt_id, question_key)` unique constraint —
 * calling this again for a Question the Founder already answered simply
 * overwrites the prior value, which is the normal "edit my answer" case,
 * not an error.
 */
export async function saveFounderResponse(
  actor: ActorContext,
  input: unknown,
): Promise<ModuleResponse> {
  assertRole(actor, ["founder"]);
  const normalized = normalizeSaveFounderResponseInput(input);
  const attemptId = parseEntityIdOrNotFound(normalized.attemptId, "Attempt not found.");

  const client = await pool.connect();
  try {
    await client.query("begin");
    const workspace = await resolveFounderWorkspace(actor, client);

    // Single-lock path (no run_module lock needed here — see the
    // module-level lock-ordering comment): the run_module chain below is
    // read-only, only used to resolve module_definition_id and the
    // module_events FK columns.
    const attemptResult = await client.query<AttemptRow>(
      `select ${ATTEMPT_COLUMNS} from module_attempts
       where id = $1 and workspace_id = $2
       for update`,
      [attemptId, workspace.id],
    );
    const attemptRow = attemptResult.rows[0];
    if (!attemptRow) {
      throw new ServiceError("NOT_FOUND", "Attempt not found.");
    }
    if (attemptRow.status !== "draft" && attemptRow.status !== "in_progress") {
      throw new ServiceError(
        "ATTEMPT_NOT_EDITABLE",
        `Attempt is "${attemptRow.status}" and can no longer be edited.`,
      );
    }

    const runModuleResult = await client.query<{
      id: string;
      module_definition_id: string;
      program_run_id: string;
      program_run_branch_id: string;
    }>(
      `select id, module_definition_id, program_run_id, program_run_branch_id
       from program_run_modules
       where id = $1 and workspace_id = $2`,
      [attemptRow.program_run_module_id, workspace.id],
    );
    const runModule = runModuleResult.rows[0];
    if (!runModule) {
      // Defensive: module_attempts_run_module_workspace_fk guarantees this
      // row exists for every Attempt already scoped to this Workspace.
      throw new ServiceError(
        "INTERNAL_INVARIANT_ERROR",
        `Attempt ${attemptRow.id} has no owning program_run_module.`,
      );
    }

    const questionResult = await client.query<QuestionRow>(
      `select question_key, sequence_index, question_text, response_type,
              allow_skip, options, conditions
       from module_questions
       where module_definition_id = $1 and question_key = $2 and status = 'active'`,
      [runModule.module_definition_id, normalized.questionKey],
    );
    const question = questionResult.rows[0];
    if (!question) {
      // Indistinguishable from the caller's perspective whether
      // questionKey belongs to a different Module or doesn't exist at all
      // — both are simply "not found" (same enumeration-safety rationale
      // as parseEntityIdOrNotFound).
      throw new ServiceError("NOT_FOUND", "Question not found.");
    }

    const answerText = await resolveAnswerText(
      client,
      attemptRow.id,
      question,
      normalized.responseStatus,
      normalized.value,
    );

    const interactionProvider = resolveInteractionProvider(actor);
    if (interactionProvider === "system") {
      // Structurally unreachable given assertRole(actor, ["founder"])
      // above (a "system" actor has no business acting as a Founder) —
      // defensive only. module_responses.source_provider's check
      // constraint has no "system" value at all, so this must never reach
      // the insert below.
      throw new ServiceError(
        "INTERNAL_INVARIANT_ERROR",
        'A founder actor cannot have source "system".',
      );
    }

    const responseResult = await client.query<ResponseRow>(
      `insert into module_responses (
         workspace_id, module_attempt_id, question_key, sequence_index,
         question_text_snapshot, response_type, response_status,
         answer_text, answer_data, source_provider, captured_via,
         provided_by_user_id, answered_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, null, $9, 'direct_response', $10, now())
       on conflict (module_attempt_id, question_key)
       do update set
         response_status = excluded.response_status,
         answer_text = excluded.answer_text,
         answer_data = excluded.answer_data,
         answered_at = excluded.answered_at,
         updated_at = now()
       returning ${RESPONSE_COLUMNS}`,
      [
        workspace.id,
        attemptRow.id,
        question.question_key,
        question.sequence_index,
        question.question_text,
        question.response_type,
        normalized.responseStatus,
        answerText,
        interactionProvider,
        actor.userId,
      ],
    );

    // First-response transition: draft -> in_progress. Left untouched if
    // already in_progress (a later edit to an existing answer).
    if (attemptRow.status === "draft") {
      await client.query(
        `update module_attempts set status = 'in_progress', updated_at = now() where id = $1`,
        [attemptRow.id],
      );
    }

    await insertModuleEvent(client, {
      workspaceId: workspace.id,
      programRunId: runModule.program_run_id,
      programRunBranchId: runModule.program_run_branch_id,
      programRunModuleId: runModule.id,
      moduleAttemptId: attemptRow.id,
      eventType: "response_saved",
      actor,
    });

    await client.query("commit");
    return mapResponseRow(responseResult.rows[0]);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

function normalizeSubmitAttemptInput(input: unknown): { attemptId: string } {
  if (typeof input !== "object" || input === null || !("attemptId" in input)) {
    throw new ServiceError("VALIDATION_ERROR", "attemptId is required.");
  }
  const { attemptId } = input as { attemptId: unknown };
  if (typeof attemptId !== "string" || attemptId.trim().length === 0) {
    throw new ServiceError("VALIDATION_ERROR", "attemptId must be a non-blank string.");
  }
  return { attemptId };
}

/**
 * Submits an Attempt for review: freezes Responses into a
 * module_review_context_snapshots row and moves the Attempt to 'submitted'.
 * Zero Responses is valid — completeness is checked by validators, not here.
 *
 * Idempotency is deliberately narrow: only 'submitted'/'ready_for_review'
 * short-circuit (returning the Attempt unchanged, no snapshot
 * regeneration, no submitted_at rewrite). 'accepted'/'rejected'/
 * 'validation_failed'/'cancelled' throw ATTEMPT_NOT_SUBMITTABLE instead of
 * silently succeeding — a repeat submit against a terminal Attempt is
 * either a client bug (accepted/cancelled) or should go through a new
 * Retry Attempt instead (rejected/validation_failed), not resubmit the
 * same one.
 */
export async function submitAttempt(
  actor: ActorContext,
  input: unknown,
): Promise<ModuleAttempt> {
  assertRole(actor, ["founder"]);
  const normalized = normalizeSubmitAttemptInput(input);
  const attemptId = parseEntityIdOrNotFound(normalized.attemptId, "Attempt not found.");

  const client = await pool.connect();
  try {
    await client.query("begin");
    const workspace = await resolveFounderWorkspace(actor, client);

    const lookupResult = await client.query<{ program_run_module_id: string }>(
      `select program_run_module_id from module_attempts
       where id = $1 and workspace_id = $2`,
      [attemptId, workspace.id],
    );
    const runModuleId = lookupResult.rows[0]?.program_run_module_id;
    if (!runModuleId) {
      throw new ServiceError("NOT_FOUND", "Attempt not found.");
    }

    // Lock ordering: run_module before attempt (module-level comment) —
    // this path never writes a run_module column, but stays consistent so
    // it can never deadlock against startOrResumeAttempt.
    const runModuleResult = await client.query<{
      id: string;
      program_run_id: string;
      program_run_branch_id: string;
    }>(
      `select id, program_run_id, program_run_branch_id
       from program_run_modules
       where id = $1 and workspace_id = $2
       for update`,
      [runModuleId, workspace.id],
    );
    const runModule = runModuleResult.rows[0];
    if (!runModule) {
      throw new ServiceError(
        "INTERNAL_INVARIANT_ERROR",
        `Attempt ${attemptId} has no owning program_run_module.`,
      );
    }

    const attemptResult = await client.query<AttemptRow>(
      `select ${ATTEMPT_COLUMNS} from module_attempts
       where id = $1 and program_run_module_id = $2
       for update`,
      [attemptId, runModule.id],
    );
    const attempt = attemptResult.rows[0];
    if (!attempt) {
      throw new ServiceError("NOT_FOUND", "Attempt not found.");
    }

    if (attempt.status === "submitted" || attempt.status === "ready_for_review") {
      await client.query("commit");
      return mapAttemptRow(attempt);
    }

    if (attempt.status !== "draft" && attempt.status !== "in_progress") {
      throw new ServiceError(
        "ATTEMPT_NOT_SUBMITTABLE",
        `Attempt is "${attempt.status}" and cannot be submitted.`,
      );
    }

    const responsesResult = await client.query<{
      question_key: string;
      question_text_snapshot: string;
      response_type: ModuleResponseType;
      response_status: ModuleResponseStatus;
      answer_text: string | null;
      answer_data: unknown;
    }>(
      `select question_key, question_text_snapshot, response_type,
              response_status, answer_text, answer_data
       from module_responses
       where module_attempt_id = $1
       order by sequence_index`,
      [attempt.id],
    );
    const responseSnapshot = responsesResult.rows.map((row) => ({
      questionKey: row.question_key,
      questionText: row.question_text_snapshot,
      responseType: row.response_type,
      responseStatus: row.response_status,
      answerText: row.answer_text,
      answerData: row.answer_data,
    }));

    await client.query(
      `insert into module_review_context_snapshots (
         workspace_id, module_attempt_id, response_snapshot
       )
       values ($1, $2, $3::jsonb)`,
      [workspace.id, attempt.id, JSON.stringify(responseSnapshot)],
    );

    const updatedResult = await client.query<AttemptRow>(
      `update module_attempts
       set status = 'submitted', submitted_at = now(), updated_at = now()
       where id = $1
       returning ${ATTEMPT_COLUMNS}`,
      [attempt.id],
    );

    await insertModuleEvent(client, {
      workspaceId: workspace.id,
      programRunId: runModule.program_run_id,
      programRunBranchId: runModule.program_run_branch_id,
      programRunModuleId: runModule.id,
      moduleAttemptId: attempt.id,
      eventType: "attempt_submitted",
      actor,
    });

    await client.query("commit");
    return mapAttemptRow(updatedResult.rows[0]);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
