import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import { resolveFounderWorkspace } from "@ai-catalyst/services/workspace";
import { parseEntityIdOrNotFound } from "@ai-catalyst/services/internal/entity-id";
import {
  getArtifactSubmission,
  saveArtifactSubmission,
} from "@ai-catalyst/services/artifact";

import {
  INTERVIEW_EVIDENCE_ARTIFACT_KEY,
  MODULE_4_KEY,
} from "@ai-catalyst/services/interview/types";

import {
  ACTIVITY_COLUMNS,
  getInterviewActivityForProgramRun,
  type ActivityRow,
} from "@ai-catalyst/services/interview/records";

// Module 4 pin/readiness helpers: gate whether Claude may start/continue a
// Module 4 attempt, and materialise + freeze the confirmed evidence
// markdown onto that attempt (source_interview_evidence_artifact_id).

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
