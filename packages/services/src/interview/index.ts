import type { PoolClient } from "pg";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import { resolveFounderWorkspace } from "@ai-catalyst/services/workspace";
import { parseEntityIdOrNotFound } from "@ai-catalyst/services/internal/entity-id";
import {
  getArtifactSubmission,
  saveArtifactSubmission,
} from "@ai-catalyst/services/artifact";
import { parseInterviewGuide } from "@ai-catalyst/services/artifact/internal/renderers/parse/interview-guide";

import { buildInterviewEvidenceMarkdown } from "@ai-catalyst/services/interview/evidence-markdown";
import {
  INTERVIEW_EVIDENCE_ARTIFACT_KEY,
  INTERVIEW_MINIMUM_COUNT,
  INTERVIEW_RECOMMENDED_COUNT,
  MODULE_3_KEY,
  MODULE_4_KEY,
  type InterviewActivity,
  type InterviewEvidenceStatus,
  type InterviewProgress,
  type InterviewQuestionSnapshot,
  type InterviewRecord,
  type InterviewRecordStatus,
} from "@ai-catalyst/services/interview/types";

export {
  INTERVIEW_EVIDENCE_ARTIFACT_KEY,
  INTERVIEW_MINIMUM_COUNT,
  INTERVIEW_RECOMMENDED_COUNT,
  MODULE_3_KEY,
  MODULE_4_KEY,
  buildInterviewEvidenceMarkdown,
};
export type {
  InterviewActivity,
  InterviewEvidenceStatus,
  InterviewProgress,
  InterviewQuestionSnapshot,
  InterviewRecord,
  InterviewRecordStatus,
};

// ---------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------

interface ActivityRow {
  id: string;
  workspace_id: string;
  program_run_id: string;
  source_module_attempt_id: string;
  questions: InterviewQuestionSnapshot[] | unknown;
  evidence_status: InterviewEvidenceStatus;
  evidence_confirmed_at: Date | null;
  confirmed_markdown: string | null;
  confirmed_source_record_ids: string[] | unknown;
  confirmed_artifact_submission_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface RecordRow {
  id: string;
  activity_id: string;
  sequence_index: number;
  interviewee_name: string;
  company: string;
  role: string;
  interviewed_at: string | Date | null;
  answers: Record<string, string> | unknown;
  key_quote: string | null;
  current_workaround: string | null;
  status: InterviewRecordStatus;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function asQuestions(raw: unknown): InterviewQuestionSnapshot[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, i) => {
    const row = item as { index?: unknown; text?: unknown };
    return {
      index: typeof row.index === "number" ? row.index : i + 1,
      text: typeof row.text === "string" ? row.text : "",
    };
  });
}

function asStringIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === "string");
}

function asAnswers(raw: unknown): Record<string, string> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

function mapActivity(row: ActivityRow): InterviewActivity {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    programRunId: row.program_run_id,
    sourceModuleAttemptId: row.source_module_attempt_id,
    questions: asQuestions(row.questions),
    evidenceStatus: row.evidence_status,
    evidenceConfirmedAt: row.evidence_confirmed_at?.toISOString() ?? null,
    confirmedMarkdown: row.confirmed_markdown,
    confirmedSourceRecordIds: asStringIds(row.confirmed_source_record_ids),
    confirmedArtifactSubmissionId: row.confirmed_artifact_submission_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapRecord(row: RecordRow): InterviewRecord {
  const interviewedAt =
    row.interviewed_at instanceof Date
      ? row.interviewed_at.toISOString().slice(0, 10)
      : typeof row.interviewed_at === "string"
        ? row.interviewed_at.slice(0, 10)
        : null;
  return {
    id: row.id,
    activityId: row.activity_id,
    sequenceIndex: row.sequence_index,
    intervieweeName: row.interviewee_name,
    company: row.company,
    role: row.role,
    interviewedAt,
    answers: asAnswers(row.answers),
    keyQuote: row.key_quote,
    currentWorkaround: row.current_workaround,
    status: row.status,
    completedAt: row.completed_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const ACTIVITY_COLUMNS = `
  id, workspace_id, program_run_id, source_module_attempt_id, questions,
  evidence_status, evidence_confirmed_at, confirmed_markdown,
  confirmed_source_record_ids, confirmed_artifact_submission_id,
  created_at, updated_at
`;

const RECORD_COLUMNS = `
  id, activity_id, sequence_index, interviewee_name, company, role,
  interviewed_at, answers, key_quote, current_workaround, status,
  completed_at, created_at, updated_at
`;

// ---------------------------------------------------------------------
// Create activity on Module 3 confirm (called inside completion txn)
// ---------------------------------------------------------------------

export async function createInterviewActivityFromGuide(input: {
  client: PoolClient;
  workspaceId: string;
  programRunId: string;
  sourceModuleAttemptId: string;
  questions: InterviewQuestionSnapshot[];
}): Promise<InterviewActivity> {
  const existing = await input.client.query<ActivityRow>(
    `select ${ACTIVITY_COLUMNS} from interview_activities
     where program_run_id = $1 and workspace_id = $2`,
    [input.programRunId, input.workspaceId],
  );
  if (existing.rows[0]) {
    return mapActivity(existing.rows[0]);
  }

  const inserted = await input.client.query<ActivityRow>(
    `insert into interview_activities (
       workspace_id, program_run_id, source_module_attempt_id, questions
     ) values ($1, $2, $3, $4::jsonb)
     returning ${ACTIVITY_COLUMNS}`,
    [
      input.workspaceId,
      input.programRunId,
      input.sourceModuleAttemptId,
      JSON.stringify(input.questions),
    ],
  );
  const row = inserted.rows[0];
  if (!row) {
    throw new ServiceError(
      "INTERNAL_INVARIANT_ERROR",
      "Failed to create interview activity.",
    );
  }
  return mapActivity(row);
}

/** Load Module 3 guide questions for snapshotting at confirm time. */
export async function loadGuideQuestionsForAttempt(
  actor: ActorContext,
  attemptId: string,
): Promise<InterviewQuestionSnapshot[]> {
  const submission = await getArtifactSubmission(actor, {
    attemptId,
    artifactKey: "problem_interview_guide",
  });
  if (!submission?.content) {
    throw new ServiceError(
      "INTERNAL_INVARIANT_ERROR",
      "Problem Interview Guide is missing; cannot snapshot interview questions.",
    );
  }
  const model = parseInterviewGuide(submission.content);
  return model.questions.map((text, i) => ({
    index: i + 1,
    text,
  }));
}

// ---------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------

export async function getInterviewActivityForProgramRun(
  actor: ActorContext,
  programRunIdRaw: string,
): Promise<InterviewActivity | null> {
  assertRole(actor, ["founder"]);
  const programRunId = parseEntityIdOrNotFound(
    programRunIdRaw,
    "Program run not found.",
  );
  const workspace = await resolveFounderWorkspace(actor);
  const result = await pool.query<ActivityRow>(
    `select ${ACTIVITY_COLUMNS} from interview_activities
     where program_run_id = $1 and workspace_id = $2`,
    [programRunId, workspace.id],
  );
  return result.rows[0] ? mapActivity(result.rows[0]) : null;
}

async function loadActivityForFounder(
  actor: ActorContext,
  activityIdRaw: string,
  client: PoolClient | typeof pool = pool,
): Promise<InterviewActivity> {
  const activityId = parseEntityIdOrNotFound(
    activityIdRaw,
    "Interview activity not found.",
  );
  const workspace = await resolveFounderWorkspace(actor, client);
  const result = await client.query<ActivityRow>(
    `select ${ACTIVITY_COLUMNS} from interview_activities
     where id = $1 and workspace_id = $2`,
    [activityId, workspace.id],
  );
  const row = result.rows[0];
  if (!row) {
    throw new ServiceError("NOT_FOUND", "Interview activity not found.");
  }
  return mapActivity(row);
}

export async function listInterviewRecords(
  actor: ActorContext,
  activityIdRaw: string,
): Promise<InterviewRecord[]> {
  assertRole(actor, ["founder"]);
  const activity = await loadActivityForFounder(actor, activityIdRaw);
  const result = await pool.query<RecordRow>(
    `select ${RECORD_COLUMNS} from interview_records
     where activity_id = $1 and workspace_id = $2
     order by sequence_index`,
    [activity.id, activity.workspaceId],
  );
  return result.rows.map(mapRecord);
}

export async function getInterviewRecord(
  actor: ActorContext,
  recordIdRaw: string,
): Promise<InterviewRecord> {
  assertRole(actor, ["founder"]);
  const recordId = parseEntityIdOrNotFound(
    recordIdRaw,
    "Interview record not found.",
  );
  const workspace = await resolveFounderWorkspace(actor);
  const result = await pool.query<RecordRow>(
    `select ${RECORD_COLUMNS} from interview_records
     where id = $1 and workspace_id = $2`,
    [recordId, workspace.id],
  );
  const row = result.rows[0];
  if (!row) {
    throw new ServiceError("NOT_FOUND", "Interview record not found.");
  }
  return mapRecord(row);
}

export async function getInterviewProgress(
  actor: ActorContext,
  programRunIdRaw: string,
): Promise<InterviewProgress | null> {
  assertRole(actor, ["founder"]);
  const activity = await getInterviewActivityForProgramRun(
    actor,
    programRunIdRaw,
  );
  if (!activity) return null;

  const counts = await pool.query<{
    completed_count: string;
    draft_count: string;
    total_count: string;
  }>(
    `select
       count(*) filter (where status = 'completed')::text as completed_count,
       count(*) filter (where status = 'draft')::text as draft_count,
       count(*)::text as total_count
     from interview_records
     where activity_id = $1 and workspace_id = $2`,
    [activity.id, activity.workspaceId],
  );
  const row = counts.rows[0];
  const completedCount = Number(row?.completed_count ?? 0);
  return {
    completedCount,
    recommendedCount: INTERVIEW_RECOMMENDED_COUNT,
    requirementMet: completedCount >= INTERVIEW_MINIMUM_COUNT,
    evidenceStatus: activity.evidenceStatus,
    draftCount: Number(row?.draft_count ?? 0),
    totalCount: Number(row?.total_count ?? 0),
  };
}

// ---------------------------------------------------------------------
// Mutations — records
// ---------------------------------------------------------------------

async function assertNoPinnedClaudeAttempt(
  workspaceId: string,
  programRunId: string,
  client: PoolClient,
): Promise<void> {
  const pinned = await client.query<{ id: string }>(
    `select a.id
     from module_attempts a
     join program_run_modules m
       on m.id = a.program_run_module_id and m.workspace_id = a.workspace_id
     where m.program_run_id = $1
       and m.workspace_id = $2
       and m.module_key = $3
       and a.source_interview_evidence_artifact_id is not null
       and a.status in ('draft', 'in_progress', 'submitted', 'validation_failed', 'ready_for_review')
     limit 1`,
    [programRunId, workspaceId, MODULE_4_KEY],
  );
  if (pinned.rows[0]) {
    throw new ServiceError(
      "EVIDENCE_FROZEN_FOR_ATTEMPT",
      "A Module 4 Claude attempt is already using a frozen evidence snapshot. Finish or retry that attempt before changing interviews.",
    );
  }
}

async function autoReopenIfConfirmed(
  client: PoolClient,
  activity: InterviewActivity,
): Promise<void> {
  if (activity.evidenceStatus !== "confirmed") return;
  await client.query(
    `update interview_activities
     set evidence_status = 'draft',
         evidence_confirmed_at = null,
         confirmed_markdown = null,
         confirmed_source_record_ids = '[]'::jsonb,
         confirmed_artifact_submission_id = null,
         updated_at = now()
     where id = $1 and workspace_id = $2`,
    [activity.id, activity.workspaceId],
  );
}

export async function addInterviewRecord(
  actor: ActorContext,
  activityIdRaw: string,
): Promise<InterviewRecord> {
  assertRole(actor, ["founder"]);
  const client = await pool.connect();
  try {
    await client.query("begin");
    const activity = await loadActivityForFounder(actor, activityIdRaw, client);
    await assertNoPinnedClaudeAttempt(
      activity.workspaceId,
      activity.programRunId,
      client,
    );
    await autoReopenIfConfirmed(client, activity);

    const next = await client.query<{ next: string }>(
      `select coalesce(max(sequence_index), 0) + 1 as next
       from interview_records
       where activity_id = $1`,
      [activity.id],
    );
    const sequenceIndex = Number(next.rows[0]?.next ?? 1);
    const inserted = await client.query<RecordRow>(
      `insert into interview_records (
         workspace_id, activity_id, sequence_index
       ) values ($1, $2, $3)
       returning ${RECORD_COLUMNS}`,
      [activity.workspaceId, activity.id, sequenceIndex],
    );
    await client.query("commit");
    const row = inserted.rows[0];
    if (!row) {
      throw new ServiceError(
        "INTERNAL_INVARIANT_ERROR",
        "Failed to create interview record.",
      );
    }
    return mapRecord(row);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

function normalizeRecordFields(input: unknown): {
  intervieweeName: string;
  company: string;
  role: string;
  interviewedAt: string | null;
  answers: Record<string, string>;
  keyQuote: string | null;
  currentWorkaround: string | null;
} {
  if (typeof input !== "object" || input === null) {
    throw new ServiceError("VALIDATION_ERROR", "Record fields are required.");
  }
  const body = input as Record<string, unknown>;
  const intervieweeName =
    typeof body.intervieweeName === "string" ? body.intervieweeName : "";
  const company = typeof body.company === "string" ? body.company : "";
  const role = typeof body.role === "string" ? body.role : "";
  let interviewedAt: string | null = null;
  if (typeof body.interviewedAt === "string" && body.interviewedAt.trim()) {
    interviewedAt = body.interviewedAt.trim().slice(0, 10);
  }
  const answers = asAnswers(body.answers);
  const keyQuote = typeof body.keyQuote === "string" ? body.keyQuote : null;
  const currentWorkaround =
    typeof body.currentWorkaround === "string" ? body.currentWorkaround : null;
  return {
    intervieweeName,
    company,
    role,
    interviewedAt,
    answers,
    keyQuote,
    currentWorkaround,
  };
}

export async function saveInterviewRecordDraft(
  actor: ActorContext,
  recordIdRaw: string,
  fields: unknown,
): Promise<InterviewRecord> {
  assertRole(actor, ["founder"]);
  const recordId = parseEntityIdOrNotFound(
    recordIdRaw,
    "Interview record not found.",
  );
  const normalized = normalizeRecordFields(fields);
  const client = await pool.connect();
  try {
    await client.query("begin");
    const workspace = await resolveFounderWorkspace(actor, client);
    const existing = await client.query<
      RecordRow & {
        program_run_id: string;
        evidence_status: InterviewEvidenceStatus;
      }
    >(
      `select r.*, a.program_run_id, a.evidence_status
       from interview_records r
       join interview_activities a
         on a.id = r.activity_id and a.workspace_id = r.workspace_id
       where r.id = $1 and r.workspace_id = $2
       for update of r, a`,
      [recordId, workspace.id],
    );
    const row = existing.rows[0];
    if (!row) {
      throw new ServiceError("NOT_FOUND", "Interview record not found.");
    }
    await assertNoPinnedClaudeAttempt(workspace.id, row.program_run_id, client);
    if (row.status === "completed") {
      throw new ServiceError(
        "VALIDATION_ERROR",
        "This interview is completed and cannot be edited.",
      );
    }
    if (row.evidence_status === "confirmed") {
      await autoReopenIfConfirmed(client, {
        id: row.activity_id,
        workspaceId: workspace.id,
        programRunId: row.program_run_id,
        sourceModuleAttemptId: "",
        questions: [],
        evidenceStatus: row.evidence_status,
        evidenceConfirmedAt: null,
        confirmedMarkdown: null,
        confirmedSourceRecordIds: [],
        confirmedArtifactSubmissionId: null,
        createdAt: "",
        updatedAt: "",
      });
    }

    const updated = await client.query<RecordRow>(
      `update interview_records
       set interviewee_name = $3,
           company = $4,
           role = $5,
           interviewed_at = $6::date,
           answers = $7::jsonb,
           key_quote = $8,
           current_workaround = $9,
           status = 'draft',
           completed_at = null,
           updated_at = now()
       where id = $1 and workspace_id = $2 and status = 'draft'
       returning ${RECORD_COLUMNS}`,
      [
        recordId,
        workspace.id,
        normalized.intervieweeName,
        normalized.company,
        normalized.role,
        normalized.interviewedAt,
        JSON.stringify(normalized.answers),
        normalized.keyQuote,
        normalized.currentWorkaround,
      ],
    );
    await client.query("commit");
    const out = updated.rows[0];
    if (!out) {
      throw new ServiceError("NOT_FOUND", "Interview record not found.");
    }
    return mapRecord(out);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertCompleteable(fields: {
  intervieweeName: string;
  company: string;
  role: string;
  interviewedAt: string | null;
  answers: Record<string, string>;
  questions: InterviewQuestionSnapshot[];
}): void {
  if (!fields.intervieweeName.trim()) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "Interviewee name is required to complete an interview.",
    );
  }
  if (!fields.company.trim()) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "Company is required to complete an interview.",
    );
  }
  if (!fields.role.trim()) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "Role is required to complete an interview.",
    );
  }
  if (!fields.interviewedAt || !ISO_DATE.test(fields.interviewedAt)) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "Interview date is required in YYYY-MM-DD format to complete an interview.",
    );
  }
  for (const q of fields.questions) {
    const answer = fields.answers[String(q.index)]?.trim() ?? "";
    if (!answer) {
      throw new ServiceError(
        "VALIDATION_ERROR",
        `Answer for Q${q.index} is required to complete an interview.`,
      );
    }
  }
}

export async function completeInterviewRecord(
  actor: ActorContext,
  recordIdRaw: string,
  fields: unknown,
): Promise<InterviewRecord> {
  assertRole(actor, ["founder"]);
  const recordId = parseEntityIdOrNotFound(
    recordIdRaw,
    "Interview record not found.",
  );
  const normalized = normalizeRecordFields(fields);
  const client = await pool.connect();
  try {
    await client.query("begin");
    const workspace = await resolveFounderWorkspace(actor, client);
    const existing = await client.query<
      RecordRow & {
        program_run_id: string;
        evidence_status: InterviewEvidenceStatus;
        questions: unknown;
      }
    >(
      `select r.*, a.program_run_id, a.evidence_status, a.questions
       from interview_records r
       join interview_activities a
         on a.id = r.activity_id and a.workspace_id = r.workspace_id
       where r.id = $1 and r.workspace_id = $2
       for update of r, a`,
      [recordId, workspace.id],
    );
    const row = existing.rows[0];
    if (!row) {
      throw new ServiceError("NOT_FOUND", "Interview record not found.");
    }
    await assertNoPinnedClaudeAttempt(workspace.id, row.program_run_id, client);
    await autoReopenIfConfirmed(client, {
      id: row.activity_id,
      workspaceId: workspace.id,
      programRunId: row.program_run_id,
      sourceModuleAttemptId: "",
      questions: asQuestions(row.questions),
      evidenceStatus: row.evidence_status,
      evidenceConfirmedAt: null,
      confirmedMarkdown: null,
      confirmedSourceRecordIds: [],
      confirmedArtifactSubmissionId: null,
      createdAt: "",
      updatedAt: "",
    });

    if (row.status === "completed") {
      throw new ServiceError(
        "VALIDATION_ERROR",
        "This interview is already completed and cannot be changed.",
      );
    }

    const questions = asQuestions(row.questions);
    assertCompleteable({ ...normalized, questions });

    const updated = await client.query<RecordRow>(
      `update interview_records
       set interviewee_name = $3,
           company = $4,
           role = $5,
           interviewed_at = $6::date,
           answers = $7::jsonb,
           key_quote = $8,
           current_workaround = $9,
           status = 'completed',
           completed_at = now(),
           updated_at = now()
       where id = $1 and workspace_id = $2 and status = 'draft'
       returning ${RECORD_COLUMNS}`,
      [
        recordId,
        workspace.id,
        normalized.intervieweeName.trim(),
        normalized.company.trim(),
        normalized.role.trim(),
        normalized.interviewedAt,
        JSON.stringify(normalized.answers),
        normalized.keyQuote,
        normalized.currentWorkaround,
      ],
    );
    await client.query("commit");
    const out = updated.rows[0];
    if (!out) {
      throw new ServiceError("NOT_FOUND", "Interview record not found.");
    }
    return mapRecord(out);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Reopen a completed interview so the Founder can edit it again before
 * confirming evidence. If evidence was already confirmed (but not pinned to a
 * Claude attempt), it returns to draft so the snapshot is rebuilt on confirm.
 */
export async function reopenInterviewRecord(
  actor: ActorContext,
  recordIdRaw: string,
): Promise<InterviewRecord> {
  assertRole(actor, ["founder"]);
  const recordId = parseEntityIdOrNotFound(
    recordIdRaw,
    "Interview record not found.",
  );
  const client = await pool.connect();
  try {
    await client.query("begin");
    const workspace = await resolveFounderWorkspace(actor, client);
    const existing = await client.query<
      RecordRow & {
        program_run_id: string;
        evidence_status: InterviewEvidenceStatus;
      }
    >(
      `select r.*, a.program_run_id, a.evidence_status
       from interview_records r
       join interview_activities a
         on a.id = r.activity_id and a.workspace_id = r.workspace_id
       where r.id = $1 and r.workspace_id = $2
       for update of r, a`,
      [recordId, workspace.id],
    );
    const row = existing.rows[0];
    if (!row) {
      throw new ServiceError("NOT_FOUND", "Interview record not found.");
    }
    await assertNoPinnedClaudeAttempt(workspace.id, row.program_run_id, client);
    await autoReopenIfConfirmed(client, {
      id: row.activity_id,
      workspaceId: workspace.id,
      programRunId: row.program_run_id,
      sourceModuleAttemptId: "",
      questions: [],
      evidenceStatus: row.evidence_status,
      evidenceConfirmedAt: null,
      confirmedMarkdown: null,
      confirmedSourceRecordIds: [],
      confirmedArtifactSubmissionId: null,
      createdAt: "",
      updatedAt: "",
    });

    if (row.status !== "completed") {
      throw new ServiceError(
        "VALIDATION_ERROR",
        "Only a completed interview can be reopened for editing.",
      );
    }

    const updated = await client.query<RecordRow>(
      `update interview_records
       set status = 'draft',
           completed_at = null,
           updated_at = now()
       where id = $1 and workspace_id = $2 and status = 'completed'
       returning ${RECORD_COLUMNS}`,
      [recordId, workspace.id],
    );
    await client.query("commit");
    const out = updated.rows[0];
    if (!out) {
      throw new ServiceError("NOT_FOUND", "Interview record not found.");
    }
    return mapRecord(out);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------
// Evidence preview / confirm / reopen
// ---------------------------------------------------------------------

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
    const updated = await client.query<ActivityRow>(
      `update interview_activities
       set evidence_status = 'draft',
           evidence_confirmed_at = null,
           confirmed_markdown = null,
           confirmed_source_record_ids = '[]'::jsonb,
           confirmed_artifact_submission_id = null,
           updated_at = now()
       where program_run_id = $1 and workspace_id = $2
       returning ${ACTIVITY_COLUMNS}`,
      [programRunId, workspace.id],
    );
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

/**
 * Whether Module 4 may show Continue in Claude / start a Claude attempt.
 */
export async function isModule4ClaudeReady(
  actor: ActorContext,
  programRunIdRaw: string,
): Promise<boolean> {
  const activity = await getInterviewActivityForProgramRun(
    actor,
    programRunIdRaw,
  );
  return activity?.evidenceStatus === "confirmed";
}

/**
 * Return confirmed markdown for Claude, preferring the attempt pin.
 */
export async function getPinnedInterviewEvidenceMarkdown(
  actor: ActorContext,
  attemptIdRaw: string,
): Promise<{ artifactSubmissionId: string; markdown: string } | null> {
  assertRole(actor, ["founder"]);
  const attemptId = parseEntityIdOrNotFound(attemptIdRaw, "Attempt not found.");
  const workspace = await resolveFounderWorkspace(actor);

  const attemptResult = await pool.query<{
    id: string;
    workspace_id: string;
    source_interview_evidence_artifact_id: string | null;
  }>(
    `select id, workspace_id, source_interview_evidence_artifact_id
     from module_attempts
     where id = $1 and workspace_id = $2`,
    [attemptId, workspace.id],
  );
  const attempt = attemptResult.rows[0];
  if (!attempt) {
    throw new ServiceError("NOT_FOUND", "Attempt not found.");
  }
  if (!attempt.source_interview_evidence_artifact_id) {
    return null;
  }

  const submission = await getArtifactSubmission(actor, {
    attemptId,
    artifactKey: INTERVIEW_EVIDENCE_ARTIFACT_KEY,
  });
  if (!submission?.content) {
    return null;
  }
  return {
    artifactSubmissionId: attempt.source_interview_evidence_artifact_id,
    markdown: submission.content,
  };
}

/**
 * After a Module 4 attempt is created/resumed for Claude: require confirmed
 * evidence, materialise Interview-Evidence.md, pin artifact id on the attempt.
 * Idempotent when already pinned.
 */
export async function pinInterviewEvidenceForModule4Attempt(
  actor: ActorContext,
  attemptIdRaw: string,
): Promise<{ artifactSubmissionId: string }> {
  assertRole(actor, ["founder"]);
  const attemptId = parseEntityIdOrNotFound(attemptIdRaw, "Attempt not found.");
  const workspace = await resolveFounderWorkspace(actor);

  const attemptResult = await pool.query<{
    id: string;
    workspace_id: string;
    program_run_id: string;
    module_key: string;
    status: string;
    source_interview_evidence_artifact_id: string | null;
  }>(
    `select a.id, a.workspace_id, a.status,
            a.source_interview_evidence_artifact_id,
            m.program_run_id, m.module_key
     from module_attempts a
     join program_run_modules m
       on m.id = a.program_run_module_id and m.workspace_id = a.workspace_id
     where a.id = $1 and a.workspace_id = $2`,
    [attemptId, workspace.id],
  );
  const attempt = attemptResult.rows[0];
  if (!attempt) {
    throw new ServiceError("NOT_FOUND", "Attempt not found.");
  }
  if (attempt.module_key !== MODULE_4_KEY) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "Interview evidence pinning applies only to Module 4.",
    );
  }
  if (attempt.source_interview_evidence_artifact_id) {
    return {
      artifactSubmissionId: attempt.source_interview_evidence_artifact_id,
    };
  }

  const activityResult = await pool.query<ActivityRow>(
    `select ${ACTIVITY_COLUMNS} from interview_activities
     where program_run_id = $1 and workspace_id = $2`,
    [attempt.program_run_id, workspace.id],
  );
  const activity = activityResult.rows[0];
  if (!activity || activity.evidence_status !== "confirmed") {
    throw new ServiceError(
      "EVIDENCE_NOT_CONFIRMED",
      "Confirm interview evidence on the website before continuing in Claude.",
    );
  }
  if (!activity.confirmed_markdown) {
    throw new ServiceError(
      "INTERNAL_INVARIANT_ERROR",
      "Confirmed evidence is missing its markdown body.",
    );
  }

  const submission = await saveArtifactSubmission(actor, {
    attemptId,
    artifactKey: INTERVIEW_EVIDENCE_ARTIFACT_KEY,
    content: activity.confirmed_markdown,
  });

  await pool.query(
    `update module_attempts
     set source_interview_evidence_artifact_id = $3, updated_at = now()
     where id = $1 and workspace_id = $2
       and source_interview_evidence_artifact_id is null`,
    [attemptId, workspace.id, submission.id],
  );
  await pool.query(
    `update interview_activities
     set confirmed_artifact_submission_id = $3, updated_at = now()
     where id = $1 and workspace_id = $2`,
    [activity.id, workspace.id, submission.id],
  );

  return { artifactSubmissionId: submission.id };
}
