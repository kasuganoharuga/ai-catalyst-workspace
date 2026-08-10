import type { PoolClient } from "pg";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import { resolveFounderWorkspace } from "@ai-catalyst/services/workspace";
import { parseEntityIdOrNotFound } from "@ai-catalyst/services/internal/entity-id";
import { insertModuleEventRow } from "@ai-catalyst/services/internal/module-events";
import { resolveInteractionProvider } from "@ai-catalyst/services/attempt/internal/interaction-provider";

import { buildInterviewEvidenceMarkdown } from "@ai-catalyst/services/interview/evidence-markdown";
import {
  INTERVIEW_MINIMUM_COUNT,
  MODULE_4_KEY,
  type InterviewActivity,
} from "@ai-catalyst/services/interview/types";

import {
  ACTIVITY_COLUMNS,
  RECORD_COLUMNS,
  assertNoPinnedClaudeAttempt,
  asQuestions,
  getInterviewActivityForProgramRun,
  listInterviewRecords,
  mapActivity,
  mapRecord,
  type ActivityRow,
  type RecordRow,
} from "@ai-catalyst/services/interview/records";

// Evidence lifecycle: submit the completed interview set for review, preview
// the evidence markdown, confirm (lock) it, and reopen it for edits. This is
// the only place Module 4 module-event rows get written from the interview
// domain — record CRUD (records.ts) never emits them.

interface Module4EventContext {
  workspaceId: string;
  programRunId: string;
  programRunBranchId: string;
  programRunModuleId: string;
  moduleAttemptId: string | null;
}

async function resolveModule4EventContext(
  client: PoolClient,
  workspaceId: string,
  programRunId: string,
): Promise<Module4EventContext | null> {
  const result = await client.query<{
    id: string;
    program_run_branch_id: string;
    active_attempt_id: string | null;
  }>(
    `select prm.id, prm.program_run_branch_id, prm.active_attempt_id
     from program_run_modules prm
     where prm.program_run_id = $1
       and prm.workspace_id = $2
       and prm.module_key = $3
     limit 1`,
    [programRunId, workspaceId, MODULE_4_KEY],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    workspaceId,
    programRunId,
    programRunBranchId: row.program_run_branch_id,
    programRunModuleId: row.id,
    moduleAttemptId: row.active_attempt_id,
  };
}

async function insertInterviewModuleEvent(
  client: PoolClient,
  input: {
    context: Module4EventContext;
    eventType:
      "interview_set_submitted" | "evidence_confirmed" | "evidence_reopened";
    actor: ActorContext;
    fromStatus: string | null;
    toStatus: string | null;
    activityId: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await insertModuleEventRow(client, {
    workspaceId: input.context.workspaceId,
    programRunId: input.context.programRunId,
    programRunBranchId: input.context.programRunBranchId,
    programRunModuleId: input.context.programRunModuleId,
    moduleAttemptId: input.context.moduleAttemptId,
    eventType: input.eventType,
    actorType: "user",
    actorUserId: input.actor.userId,
    sourceProvider: resolveInteractionProvider(input.actor),
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    metadata: input.metadata,
    entityType: "interview_activity",
    entityId: input.activityId,
    actor: input.actor,
  });
}

/**
 * Hand the completed interview set to Evidence Review (Module 4).
 * Does not lock markdown — Confirm evidence does that.
 */
export async function submitInterviewSetForReview(
  actor: ActorContext,
  programRunIdRaw: string,
): Promise<InterviewActivity> {
  assertRole(actor, ["founder"]);
  const programRunId = parseEntityIdOrNotFound(
    programRunIdRaw,
    "Program run not found.",
  );
  const client = await pool.connect();
  try {
    await client.query("begin");
    const workspace = await resolveFounderWorkspace(actor, client);
    await assertNoPinnedClaudeAttempt(workspace.id, programRunId, client);

    const activityResult = await client.query<ActivityRow>(
      `select ${ACTIVITY_COLUMNS} from interview_activities
       where program_run_id = $1 and workspace_id = $2
       for update`,
      [programRunId, workspace.id],
    );
    const activityRow = activityResult.rows[0];
    if (!activityRow) {
      throw new ServiceError("NOT_FOUND", "Interview activity not found.");
    }
    if (activityRow.evidence_status === "confirmed") {
      throw new ServiceError(
        "VALIDATION_ERROR",
        "Evidence is already confirmed. Reopen evidence before changing interviews.",
      );
    }
    if (activityRow.evidence_status === "submitted") {
      await client.query("commit");
      return mapActivity(activityRow);
    }

    const recordsResult = await client.query<RecordRow>(
      `select ${RECORD_COLUMNS} from interview_records
       where activity_id = $1 and workspace_id = $2
       order by sequence_index`,
      [activityRow.id, workspace.id],
    );
    const records = recordsResult.rows.map(mapRecord);
    const completed = records.filter((r) => r.status === "completed");
    const drafts = records.filter((r) => r.status === "draft");
    if (completed.length < INTERVIEW_MINIMUM_COUNT) {
      throw new ServiceError(
        "VALIDATION_ERROR",
        `Complete all ${INTERVIEW_MINIMUM_COUNT} interviews before submitting.`,
      );
    }
    if (drafts.length > 0) {
      throw new ServiceError(
        "VALIDATION_ERROR",
        "Complete every draft interview before submitting.",
      );
    }

    const submittedAt = new Date().toISOString();
    const fromStatus = activityRow.evidence_status;
    const updated = await client.query<ActivityRow>(
      `update interview_activities
       set evidence_status = 'submitted',
           evidence_submitted_at = $3,
           updated_at = now()
       where id = $1 and workspace_id = $2
       returning ${ACTIVITY_COLUMNS}`,
      [activityRow.id, workspace.id, submittedAt],
    );
    const module4 = await resolveModule4EventContext(
      client,
      workspace.id,
      programRunId,
    );
    if (module4) {
      await insertInterviewModuleEvent(client, {
        context: module4,
        eventType: "interview_set_submitted",
        actor,
        fromStatus,
        toStatus: "submitted",
        activityId: activityRow.id,
        metadata: { completed_count: completed.length },
      });
    }
    await client.query("commit");
    const out = updated.rows[0];
    if (!out) {
      throw new ServiceError(
        "INTERNAL_INVARIANT_ERROR",
        "Failed to submit interviews for review.",
      );
    }
    return mapActivity(out);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function buildEvidencePreview(
  actor: ActorContext,
  programRunIdRaw: string,
): Promise<{ markdown: string; completedCount: number } | null> {
  assertRole(actor, ["founder"]);
  const activity = await getInterviewActivityForProgramRun(
    actor,
    programRunIdRaw,
  );
  if (!activity) return null;
  const records = await listInterviewRecords(actor, activity.id);
  const completed = records.filter((r) => r.status === "completed");
  if (activity.evidenceStatus === "confirmed" && activity.confirmedMarkdown) {
    return {
      markdown: activity.confirmedMarkdown,
      completedCount: completed.length,
    };
  }
  return {
    markdown: buildInterviewEvidenceMarkdown({
      questions: activity.questions,
      records,
    }),
    completedCount: completed.length,
  };
}

export async function confirmInterviewEvidence(
  actor: ActorContext,
  programRunIdRaw: string,
): Promise<InterviewActivity> {
  assertRole(actor, ["founder"]);
  const programRunId = parseEntityIdOrNotFound(
    programRunIdRaw,
    "Program run not found.",
  );
  const client = await pool.connect();
  try {
    await client.query("begin");
    const workspace = await resolveFounderWorkspace(actor, client);
    const activityResult = await client.query<ActivityRow>(
      `select ${ACTIVITY_COLUMNS} from interview_activities
       where program_run_id = $1 and workspace_id = $2
       for update`,
      [programRunId, workspace.id],
    );
    const activityRow = activityResult.rows[0];
    if (!activityRow) {
      throw new ServiceError("NOT_FOUND", "Interview activity not found.");
    }
    await assertNoPinnedClaudeAttempt(workspace.id, programRunId, client);

    if (activityRow.evidence_status === "confirmed") {
      await client.query("commit");
      return mapActivity(activityRow);
    }
    if (activityRow.evidence_status !== "submitted") {
      throw new ServiceError(
        "VALIDATION_ERROR",
        "Submit interviews for review before confirming evidence.",
      );
    }

    const recordsResult = await client.query<RecordRow>(
      `select ${RECORD_COLUMNS} from interview_records
       where activity_id = $1 and workspace_id = $2
       order by sequence_index`,
      [activityRow.id, workspace.id],
    );
    const records = recordsResult.rows.map(mapRecord);
    const completed = records.filter((r) => r.status === "completed");
    const drafts = records.filter((r) => r.status === "draft");
    if (completed.length < INTERVIEW_MINIMUM_COUNT) {
      throw new ServiceError(
        "VALIDATION_ERROR",
        `Complete all ${INTERVIEW_MINIMUM_COUNT} interviews before confirming evidence.`,
      );
    }
    if (drafts.length > 0) {
      throw new ServiceError(
        "VALIDATION_ERROR",
        "Complete every draft interview before confirming evidence.",
      );
    }

    const confirmedAt = new Date();
    const markdown = buildInterviewEvidenceMarkdown({
      questions: asQuestions(activityRow.questions),
      records,
      confirmedAtIso: confirmedAt.toISOString(),
    });
    const sourceIds = completed.map((r) => r.id);
    const fromStatus = activityRow.evidence_status;

    const updated = await client.query<ActivityRow>(
      `update interview_activities
       set evidence_status = 'confirmed',
           evidence_confirmed_at = $3,
           confirmed_markdown = $4,
           confirmed_source_record_ids = $5::jsonb,
           confirmed_artifact_submission_id = null,
           updated_at = now()
       where id = $1 and workspace_id = $2
       returning ${ACTIVITY_COLUMNS}`,
      [
        activityRow.id,
        workspace.id,
        confirmedAt.toISOString(),
        markdown,
        JSON.stringify(sourceIds),
      ],
    );
    const module4 = await resolveModule4EventContext(
      client,
      workspace.id,
      programRunId,
    );
    if (module4) {
      await insertInterviewModuleEvent(client, {
        context: module4,
        eventType: "evidence_confirmed",
        actor,
        fromStatus,
        toStatus: "confirmed",
        activityId: activityRow.id,
        metadata: {
          completed_count: completed.length,
          source_record_count: sourceIds.length,
        },
      });
    }
    await client.query("commit");
    const out = updated.rows[0];
    if (!out) {
      throw new ServiceError(
        "INTERNAL_INVARIANT_ERROR",
        "Failed to confirm interview evidence.",
      );
    }
    return mapActivity(out);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function reopenInterviewEvidence(
  actor: ActorContext,
  programRunIdRaw: string,
): Promise<InterviewActivity> {
  assertRole(actor, ["founder"]);
  const programRunId = parseEntityIdOrNotFound(
    programRunIdRaw,
    "Program run not found.",
  );
  const client = await pool.connect();
  try {
    await client.query("begin");
    const workspace = await resolveFounderWorkspace(actor, client);
    await assertNoPinnedClaudeAttempt(workspace.id, programRunId, client);
    const existing = await client.query<ActivityRow>(
      `select ${ACTIVITY_COLUMNS} from interview_activities
       where program_run_id = $1 and workspace_id = $2
       for update`,
      [programRunId, workspace.id],
    );
    const existingRow = existing.rows[0];
    if (!existingRow) {
      throw new ServiceError("NOT_FOUND", "Interview activity not found.");
    }
    const fromStatus = existingRow.evidence_status;
    const updated = await client.query<ActivityRow>(
      `update interview_activities
       set evidence_status = 'draft',
           evidence_submitted_at = null,
           evidence_confirmed_at = null,
           confirmed_markdown = null,
           confirmed_source_record_ids = '[]'::jsonb,
           confirmed_artifact_submission_id = null,
           updated_at = now()
       where id = $1 and workspace_id = $2
       returning ${ACTIVITY_COLUMNS}`,
      [existingRow.id, workspace.id],
    );
    const module4 = await resolveModule4EventContext(
      client,
      workspace.id,
      programRunId,
    );
    if (module4) {
      await insertInterviewModuleEvent(client, {
        context: module4,
        eventType: "evidence_reopened",
        actor,
        fromStatus,
        toStatus: "draft",
        activityId: existingRow.id,
      });
    }
    await client.query("commit");
    const out = updated.rows[0];
    if (!out) {
      throw new ServiceError("NOT_FOUND", "Interview activity not found.");
    }
    return mapActivity(out);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
