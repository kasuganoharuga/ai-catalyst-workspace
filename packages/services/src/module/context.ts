import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type {
  ArtifactSubmissionStatus,
  ModuleAttempt,
  ModuleAttemptStartedVia,
  ModuleAttemptStatus,
  ModuleAttemptType,
  ModuleContext,
  ModuleContextArtifactSummary,
  ModuleContextQuestion,
  ModuleResponseStatus,
  ModuleResponseType,
} from "@ai-catalyst/shared";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import { getRunModuleByKey } from "@ai-catalyst/services/workflow";

// Owns the read-only "everything a Facilitator needs to run one Module"
// aggregation backing the MCP `get_module_context` capability (source
// doc §21) — a pure read composed from getRunModuleByKey plus three
// small local queries; it never touches module_attempts/module_responses/
// artifact_submissions writes (those stay attempt/index.ts's and
// artifact/index.ts's own jobs). Deliberately its own row shapes/mappers
// rather than importing attempt/index.ts's private ones — same "don't
// share mappers/helpers across Service modules" convention as
// artifact/index.ts's insertArtifactModuleEvent comment.

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

async function loadAttempt(attemptId: string): Promise<AttemptRow | null> {
  const result = await pool.query<AttemptRow>(
    `select id, program_run_module_id, attempt_number, attempt_type, status,
            based_on_attempt_id, started_via, submitted_at, created_at, updated_at
     from module_attempts
     where id = $1`,
    [attemptId],
  );
  return result.rows[0] ?? null;
}

interface QuestionRow {
  question_key: string;
  sequence_index: number;
  question_text: string;
  response_type: ModuleResponseType;
  allow_skip: boolean;
  options: unknown;
}

async function loadActiveQuestions(moduleDefinitionId: string): Promise<QuestionRow[]> {
  const result = await pool.query<QuestionRow>(
    `select question_key, sequence_index, question_text, response_type, allow_skip, options
     from module_questions
     where module_definition_id = $1 and status = 'active'
     order by sequence_index`,
    [moduleDefinitionId],
  );
  return result.rows;
}

interface ResponseLookupRow {
  question_key: string;
  response_status: ModuleResponseStatus;
  answer_text: string | null;
}

// A Module with no active Attempt yet (never started, or between
// Attempts) simply has no rows here — every Question comes back with
// `responseStatus: null`, not an error.
async function loadResponsesByQuestionKey(
  attemptId: string | null,
): Promise<Map<string, ResponseLookupRow>> {
  if (!attemptId) {
    return new Map();
  }
  const result = await pool.query<ResponseLookupRow>(
    `select question_key, response_status, answer_text
     from module_responses
     where module_attempt_id = $1`,
    [attemptId],
  );
  return new Map(result.rows.map((row) => [row.question_key, row]));
}

interface ArtifactRow {
  artifact_key: string;
  name: string;
  is_required: boolean;
  required_filename: string | null;
  sequence_index: number;
  submission_version_number: number | null;
  submission_status: ArtifactSubmissionStatus | null;
  submission_submitted_at: Date | null;
}

// `attemptId` may be null (no active Attempt) — the lateral join's
// `module_attempt_id = $2` then compares against SQL NULL, which is never
// true, so every Artifact correctly comes back with `latestSubmission:
// null` rather than a stale prior Attempt's version.
async function loadModuleArtifacts(
  moduleDefinitionId: string,
  attemptId: string | null,
): Promise<ArtifactRow[]> {
  const result = await pool.query<ArtifactRow>(
    `select ad.artifact_key, ad.name, ad.is_required, ad.required_filename, ad.sequence_index,
            s.version_number as submission_version_number,
            s.status as submission_status,
            s.submitted_at as submission_submitted_at
     from artifact_definitions ad
     left join lateral (
       select version_number, status, submitted_at
       from artifact_submissions
       where module_attempt_id = $2 and artifact_definition_id = ad.id
         and status not in ('superseded', 'deleted')
       order by version_number desc
       limit 1
     ) s on true
     where ad.module_definition_id = $1
     order by ad.sequence_index`,
    [moduleDefinitionId, attemptId],
  );
  return result.rows;
}

/**
 * Loads everything a Facilitator (the AI client, via MCP) needs to run
 * one Module: the current Run/Module state, its active Attempt (if any),
 * every active Question joined with the current Attempt's Response (if
 * any), the resume point, and every Artifact's latest-version metadata.
 * Never returns Founder answer content the caller isn't already entitled
 * to — everything here is scoped through getRunModuleByKey's own
 * Workspace/Venture ownership check.
 */
export async function getModuleContext(actor: ActorContext, input: unknown): Promise<ModuleContext> {
  assertRole(actor, ["founder"]);
  const runModule = await getRunModuleByKey(actor, input);

  let activeAttempt: ModuleAttempt | null = null;
  if (runModule.activeAttemptId) {
    const attemptRow = await loadAttempt(runModule.activeAttemptId);
    if (!attemptRow) {
      throw new ServiceError(
        "INTERNAL_INVARIANT_ERROR",
        `program_run_module ${runModule.id}'s active_attempt_id points to a non-existent Attempt.`,
      );
    }
    activeAttempt = mapAttemptRow(attemptRow);
  }

  const [questionRows, artifactRows, responseMap] = await Promise.all([
    loadActiveQuestions(runModule.moduleDefinitionId),
    loadModuleArtifacts(runModule.moduleDefinitionId, runModule.activeAttemptId),
    loadResponsesByQuestionKey(runModule.activeAttemptId),
  ]);

  const questions: ModuleContextQuestion[] = questionRows.map((row) => {
    const response = responseMap.get(row.question_key);
    return {
      questionKey: row.question_key,
      sequenceIndex: row.sequence_index,
      questionText: row.question_text,
      responseType: row.response_type,
      allowSkip: row.allow_skip,
      options: row.options,
      responseStatus: response?.response_status ?? null,
      answerText: response?.answer_text ?? null,
    };
  });
  const resumeQuestionKey =
    questions.find((question) => question.responseStatus === null)?.questionKey ?? null;

  const artifacts: ModuleContextArtifactSummary[] = artifactRows.map((row) => ({
    artifactKey: row.artifact_key,
    name: row.name,
    isRequired: row.is_required,
    requiredFilename: row.required_filename,
    latestSubmission:
      row.submission_version_number === null
        ? null
        : {
            versionNumber: row.submission_version_number,
            status: row.submission_status as ArtifactSubmissionStatus,
            submittedAt: row.submission_submitted_at?.toISOString() ?? null,
          },
  }));

  return { runModule, activeAttempt, resumeQuestionKey, questions, artifacts };
}
