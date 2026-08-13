import type { PoolClient } from "pg";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type { ModuleAttempt, ModuleAttemptStatus } from "@ai-catalyst/shared";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import { resolveFounderWorkspace } from "@ai-catalyst/services/workspace";
import { parseEntityIdOrNotFound } from "@ai-catalyst/services/internal/entity-id";
import { insertModuleEvent } from "@ai-catalyst/services/attempt/internal/events";
import { resolveInteractionProvider } from "@ai-catalyst/services/attempt/internal/interaction-provider";
import {
  RETRYABLE_ATTEMPT_STATUSES,
  isRetryableAttemptStatus,
} from "@ai-catalyst/services/attempt/internal/retry";
import {
  ATTEMPT_COLUMNS,
  mapAttemptRow,
  type AttemptRow,
} from "@ai-catalyst/services/attempt/internal/rows";
// Starts or resumes a Founder's Attempt at a Module — see startOrResumeAttempt
// below for the full branch table.
//
// Module 4 used to be gated here on website-confirmed interview evidence,
// and pinned that evidence onto the attempt. Interview material is now
// uploaded as prep documents on any module's Work step, so no module
// gets special treatment at start time.
//
// Lock ordering: program_run_modules before module_attempts, always — same
// rule in save-response.ts and submit.ts.

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
  module_key: string;
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
    throw new ServiceError(
      "VALIDATION_ERROR",
      "programRunModuleId is required.",
    );
  }

  const { programRunModuleId, basedOnAttemptId } = input as {
    programRunModuleId: unknown;
    basedOnAttemptId?: unknown;
  };

  if (
    typeof programRunModuleId !== "string" ||
    programRunModuleId.trim().length === 0
  ) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "programRunModuleId must be a non-blank string.",
    );
  }

  if (basedOnAttemptId === undefined || basedOnAttemptId === null) {
    return { programRunModuleId, basedOnAttemptId: null };
  }
  if (
    typeof basedOnAttemptId !== "string" ||
    basedOnAttemptId.trim().length === 0
  ) {
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
    [
      workspaceId,
      programRunModuleId,
      actor.userId,
      resolveInteractionProvider(actor),
    ],
  );
  return result.rows[0];
}

// Caller already holds program_run_modules lock (see lock-ordering above).
// The unique-index catch on INSERT is a defensive backstop, not the primary retry guard.
async function insertRetryAttempt(
  client: PoolClient,
  workspaceId: string,
  programRunModuleId: string,
  basedOnAttemptId: string,
  actor: ActorContext,
): Promise<AttemptRow> {
  const sourceResult = await client.query<{
    id: string;
    status: ModuleAttemptStatus;
  }>(
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

// Picks the latest Attempt on this Module that is still a valid Retry
// source: retryable status, and not already consumed as based_on by a
// later Attempt. Caller must already hold the program_run_modules row
// lock so two concurrent auto-retries cannot pick the same source and
// race the unique index.
async function resolveLatestUnusedRetryableSource(
  client: PoolClient,
  programRunModuleId: string,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `select ma.id
     from module_attempts ma
     where ma.program_run_module_id = $1
       and ma.status = any($2::text[])
       and not exists (
         select 1 from module_attempts child
         where child.based_on_attempt_id = ma.id
       )
     order by ma.attempt_number desc
     limit 1
     for update of ma`,
    [programRunModuleId, [...RETRYABLE_ATTEMPT_STATUSES]],
  );
  const row = result.rows[0];
  if (!row) {
    throw new ServiceError(
      "ATTEMPT_RETRY_SOURCE_INVALID",
      "This Module has prior Attempts, but none are available to retry. Confirm the Module on the website, or start a new Venture path, before trying again.",
    );
  }
  return row.id;
}

/**
 * Start Initial, resume draft/in_progress, or create Retry.
 * Module must be startable; active attempt resumes or blocks on pending review;
 * no history → Initial; history → Retry from basedOnAttemptId or latest unused retryable source.
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
  const requestedBasedOnAttemptId =
    normalized.basedOnAttemptId === null
      ? null
      : parseEntityIdOrNotFound(
          normalized.basedOnAttemptId,
          "Attempt not found.",
        );

  const client = await pool.connect();
  try {
    await client.query("begin");
    const workspace = await resolveFounderWorkspace(actor, client);

    // Locks the program_run_modules row for the rest of this transaction
    // — per the module-level lock-ordering comment, always the first lock
    // taken. Scoped by workspace_id: a run_module belonging to another
    // Workspace is indistinguishable from one that doesn't exist.
    const runModuleResult = await client.query<RunModuleRow>(
      `select id, program_run_id, program_run_branch_id, status, active_attempt_id, module_key
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
        if (
          requestedBasedOnAttemptId !== null &&
          active.based_on_attempt_id !== requestedBasedOnAttemptId
        ) {
          throw new ServiceError(
            "VALIDATION_ERROR",
            "basedOnAttemptId does not match the currently active Attempt's based_on_attempt_id.",
          );
        }
        await client.query("commit");
        return { attempt: mapAttemptRow(active), created: false };
      }

      if (
        active.status === "submitted" ||
        active.status === "ready_for_review"
      ) {
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
      if (requestedBasedOnAttemptId !== null) {
        throw new ServiceError(
          "VALIDATION_ERROR",
          "basedOnAttemptId was provided, but this Module has no prior Attempts to retry.",
        );
      }
      newAttempt = await insertInitialAttempt(
        client,
        workspace.id,
        runModule.id,
        actor,
      );
      eventType = "attempt_started";
    } else {
      const basedOnAttemptId =
        requestedBasedOnAttemptId ??
        (await resolveLatestUnusedRetryableSource(client, runModule.id));
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
      fromStatus: null,
      toStatus: newAttempt.status,
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
