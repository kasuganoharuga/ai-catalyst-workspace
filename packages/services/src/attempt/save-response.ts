import type { PoolClient } from "pg";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type {
  ModuleResponse,
  ModuleResponseCapturedVia,
  ModuleResponseStatus,
  ModuleResponseType,
} from "@ai-catalyst/shared";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import { resolveFounderWorkspace } from "@ai-catalyst/services/workspace";
import { parseEntityIdOrNotFound } from "@ai-catalyst/services/internal/entity-id";
import { insertModuleEvent } from "@ai-catalyst/services/attempt/internal/events";
import { resolveInteractionProvider } from "@ai-catalyst/services/attempt/internal/interaction-provider";
import {
  ATTEMPT_COLUMNS,
  type AttemptRow,
} from "@ai-catalyst/services/attempt/internal/rows";
import { MINIMUM_CONFIRMED_INTERVIEWS } from "@ai-catalyst/services/prep/types";

// Mirrors apps/web/app/(app)/lib/module-display.ts's MODULE_4_KEY — see
// packages/services/src/module/context.ts's own copy of this comment.
const MODULE_4_KEY = "module-04-solution-statement";

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
function parseNonEmptyConditions(
  conditions: unknown,
): ParsedQuestionCondition | null {
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

function listOptionValues(options: unknown): string[] {
  if (!Array.isArray(options)) {
    return [];
  }
  const values: string[] = [];
  for (const option of options) {
    if (
      typeof option === "object" &&
      option !== null &&
      typeof (option as { value?: unknown }).value === "string"
    ) {
      values.push((option as { value: string }).value);
    }
  }
  return values;
}

function optionsInclude(options: unknown, value: string): boolean {
  return listOptionValues(options).includes(value);
}

const SINGLE_CHOICE_WRAPPER_KEYS = ["value", "answer", "selection"] as const;

/**
 * Resolves a single_choice payload against this question's allowed options
 * only — never a cross-module token whitelist. Conservative coercion covers
 * common model format mistakes without swallowing arbitrary schema bugs.
 */
function resolveSingleChoiceValue(
  questionKey: string,
  options: unknown,
  value: unknown,
): string {
  const allowedOptions = listOptionValues(options);
  const allowedList =
    allowedOptions.length > 0
      ? allowedOptions.map((option) => `"${option}"`).join(", ")
      : "(none configured)";

  const reject = (): never => {
    throw new ServiceError(
      "VALIDATION_ERROR",
      `Question "${questionKey}" requires a value matching one of its options: ${allowedList}.`,
    );
  };

  if (allowedOptions.length === 0) {
    return reject();
  }

  // 1. Exact string option.
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (optionsInclude(options, trimmed)) {
      return trimmed;
    }

    // 3. Text/envelope contains exactly one unambiguous allowed option.
    const matches = allowedOptions.filter((option) => {
      const pattern = new RegExp(
        `(^|[^A-Za-z0-9_])${escapeRegExp(option)}([^A-Za-z0-9_]|$)`,
        "i",
      );
      return pattern.test(trimmed);
    });
    if (matches.length === 1) {
      return matches[0];
    }
    return reject();
  }

  // 2. Known wrapper fields only — do not deep-scan arbitrary objects.
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const key of SINGLE_CHOICE_WRAPPER_KEYS) {
      const wrapped = record[key];
      if (typeof wrapped === "string") {
        const trimmed = wrapped.trim();
        if (optionsInclude(options, trimmed)) {
          return trimmed;
        }
      }
    }
  }

  return reject();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
      if (
        question.response_type === "short_text" ||
        question.response_type === "long_text"
      ) {
        if (typeof value !== "string" || value.trim().length === 0) {
          throw new ServiceError(
            "VALIDATION_ERROR",
            `Question "${question.question_key}" requires a non-empty text answer.`,
          );
        }
        return value;
      }
      if (question.response_type === "single_choice") {
        return resolveSingleChoiceValue(
          question.question_key,
          question.options,
          value,
        );
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
      const currentlyHolds = await evaluateConditionCurrentlyHolds(
        client,
        attemptId,
        condition,
      );
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
    throw new ServiceError(
      "VALIDATION_ERROR",
      "attemptId and questionKey are required.",
    );
  }

  const { attemptId, questionKey, responseStatus, value } = input as {
    attemptId: unknown;
    questionKey: unknown;
    responseStatus?: unknown;
    value?: unknown;
  };

  if (typeof attemptId !== "string" || attemptId.trim().length === 0) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "attemptId must be a non-blank string.",
    );
  }
  if (typeof questionKey !== "string" || questionKey.trim().length === 0) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "questionKey must be a non-blank string.",
    );
  }

  const normalizedStatus =
    responseStatus === undefined ? "answered" : responseStatus;
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
  const attemptId = parseEntityIdOrNotFound(
    normalized.attemptId,
    "Attempt not found.",
  );

  const client = await pool.connect();
  try {
    await client.query("begin");
    const workspace = await resolveFounderWorkspace(actor, client);

    // Single-lock path (no run_module lock needed here — see
    // start-or-resume.ts's lock-ordering comment): the run_module chain
    // below is read-only, only used to resolve module_definition_id and
    // the module_events FK columns.
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
      module_key: string;
      module_definition_id: string;
      program_run_id: string;
      program_run_branch_id: string;
    }>(
      `select id, module_key, module_definition_id, program_run_id, program_run_branch_id
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

    // Module 4's Solution blocks (product_definition onward) cannot be
    // saved until the confirmed-interview floor is met — see
    // MINIMUM_CONFIRMED_INTERVIEWS. This blocks every question_key in the
    // Module, not a subset: there is no prep-related question_key here to
    // exempt, since interview transcripts are saved through save_prep_extract,
    // a separate tool.
    if (runModule.module_key === MODULE_4_KEY) {
      const interviewCountResult = await client.query<{ total: string }>(
        `select coalesce(sum(interview_count), 0)::text as total
         from module_prep_documents
         where program_run_module_id = $1
           and withdrawn_at is null
           and document_kind = 'interview_transcript'`,
        [runModule.id],
      );
      const confirmedInterviewCount = Number(
        interviewCountResult.rows[0]?.total ?? "0",
      );
      if (confirmedInterviewCount < MINIMUM_CONFIRMED_INTERVIEWS) {
        throw new ServiceError(
          "INTERVIEW_GATE_NOT_MET",
          `Module 4 needs at least ${MINIMUM_CONFIRMED_INTERVIEWS} confirmed interview transcripts before Solution work can proceed ` +
            `(currently ${confirmedInterviewCount}/${MINIMUM_CONFIRMED_INTERVIEWS}). Save more interview transcripts with save_prep_extract first.`,
        );
      }
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
    const fromStatus = attemptRow.status;
    let toStatus: string = attemptRow.status;
    if (attemptRow.status === "draft") {
      await client.query(
        `update module_attempts set status = 'in_progress', updated_at = now() where id = $1`,
        [attemptRow.id],
      );
      toStatus = "in_progress";
    }

    await insertModuleEvent(client, {
      workspaceId: workspace.id,
      programRunId: runModule.program_run_id,
      programRunBranchId: runModule.program_run_branch_id,
      programRunModuleId: runModule.id,
      moduleAttemptId: attemptRow.id,
      eventType: "response_saved",
      actor,
      fromStatus,
      toStatus,
      metadata: { question_key: question.question_key },
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
