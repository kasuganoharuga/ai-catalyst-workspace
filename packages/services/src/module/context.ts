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
  RunModuleSummary,
} from "@ai-catalyst/shared";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import { getRunModuleByKey, listRunModules } from "@ai-catalyst/services/workflow";

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

interface QuestionRow {
  question_key: string;
  sequence_index: number;
  question_text: string;
  response_type: ModuleResponseType;
  allow_skip: boolean;
  options: unknown;
}

interface QuestionRowWithModuleId extends QuestionRow {
  module_definition_id: string;
}

interface ResponseLookupRow {
  question_key: string;
  response_status: ModuleResponseStatus;
  answer_text: string | null;
}

interface ResponseLookupRowWithAttemptId extends ResponseLookupRow {
  module_attempt_id: string;
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

interface ArtifactRowWithModuleId extends ArtifactRow {
  module_definition_id: string;
}

function groupRowsByKey<T, K extends string | number>(
  rows: T[],
  keyOf: (row: T) => K,
): Map<K, T[]> {
  const grouped = new Map<K, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.push(row);
    } else {
      grouped.set(key, [row]);
    }
  }
  return grouped;
}

async function loadAttemptsByIds(
  attemptIds: string[],
): Promise<Map<string, AttemptRow>> {
  if (attemptIds.length === 0) {
    return new Map();
  }
  const result = await pool.query<AttemptRow>(
    `select id, program_run_module_id, attempt_number, attempt_type, status,
            based_on_attempt_id, started_via, submitted_at, created_at, updated_at
     from module_attempts
     where id = any($1::uuid[])`,
    [attemptIds],
  );
  return new Map(result.rows.map((row) => [row.id, row]));
}

async function loadQuestionsByModuleDefinitionIds(
  moduleDefinitionIds: string[],
): Promise<Map<string, QuestionRow[]>> {
  if (moduleDefinitionIds.length === 0) {
    return new Map();
  }
  const result = await pool.query<QuestionRowWithModuleId>(
    `select module_definition_id, question_key, sequence_index, question_text,
            response_type, allow_skip, options
     from module_questions
     where module_definition_id = any($1::uuid[]) and status = 'active'
     order by module_definition_id, sequence_index`,
    [moduleDefinitionIds],
  );
  return groupRowsByKey(result.rows, (row) => row.module_definition_id);
}

async function loadResponsesByAttemptIds(
  attemptIds: string[],
): Promise<Map<string, Map<string, ResponseLookupRow>>> {
  if (attemptIds.length === 0) {
    return new Map();
  }
  const result = await pool.query<ResponseLookupRowWithAttemptId>(
    `select module_attempt_id, question_key, response_status, answer_text
     from module_responses
     where module_attempt_id = any($1::uuid[])`,
    [attemptIds],
  );
  const grouped = groupRowsByKey(result.rows, (row) => row.module_attempt_id);
  return new Map(
    [...grouped.entries()].map(([attemptId, rows]) => [
      attemptId,
      new Map(rows.map((row) => [row.question_key, row])),
    ]),
  );
}

async function loadArtifactsByModuleAttempts(
  moduleDefinitionIds: string[],
  attemptIds: Array<string | null>,
): Promise<Map<string, ArtifactRow[]>> {
  if (moduleDefinitionIds.length === 0) {
    return new Map();
  }
  const result = await pool.query<ArtifactRowWithModuleId>(
    `with module_ctx as (
       select *
       from unnest($1::uuid[], $2::uuid[]) as ctx(module_definition_id, attempt_id)
     )
     select mc.module_definition_id, ad.artifact_key, ad.name, ad.is_required,
            ad.required_filename, ad.sequence_index,
            s.version_number as submission_version_number,
            s.status as submission_status,
            s.submitted_at as submission_submitted_at
     from module_ctx mc
     join artifact_definitions ad on ad.module_definition_id = mc.module_definition_id
     left join lateral (
       select version_number, status, submitted_at
       from artifact_submissions
       where module_attempt_id = mc.attempt_id
         and artifact_definition_id = ad.id
         and mc.attempt_id is not null
         and status not in ('superseded', 'deleted')
       order by version_number desc
       limit 1
     ) s on true
     order by mc.module_definition_id, ad.sequence_index`,
    [moduleDefinitionIds, attemptIds],
  );
  return groupRowsByKey(result.rows, (row) => row.module_definition_id);
}

function mapArtifactSummaries(rows: ArtifactRow[]): ModuleContextArtifactSummary[] {
  return rows.map((row) => ({
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
}

function assembleModuleContext(
  runModule: RunModuleSummary,
  attemptsById: Map<string, AttemptRow>,
  questionsByModuleDefinitionId: Map<string, QuestionRow[]>,
  responsesByAttemptId: Map<string, Map<string, ResponseLookupRow>>,
  artifactsByModuleDefinitionId: Map<string, ArtifactRow[]>,
): ModuleContext {
  let activeAttempt: ModuleAttempt | null = null;
  if (runModule.activeAttemptId) {
    const attemptRow = attemptsById.get(runModule.activeAttemptId);
    if (!attemptRow) {
      throw new ServiceError(
        "INTERNAL_INVARIANT_ERROR",
        `program_run_module ${runModule.id}'s active_attempt_id points to a non-existent Attempt.`,
      );
    }
    activeAttempt = mapAttemptRow(attemptRow);
  }

  const questionRows =
    questionsByModuleDefinitionId.get(runModule.moduleDefinitionId) ?? [];
  const responseMap = runModule.activeAttemptId
    ? (responsesByAttemptId.get(runModule.activeAttemptId) ?? new Map())
    : new Map<string, ResponseLookupRow>();

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
    questions.find((question) => question.responseStatus === null)?.questionKey ??
    null;

  const artifactRows =
    artifactsByModuleDefinitionId.get(runModule.moduleDefinitionId) ?? [];

  return {
    runModule,
    activeAttempt,
    resumeQuestionKey,
    questions,
    artifacts: mapArtifactSummaries(artifactRows),
  };
}

async function buildModuleContextsFromRunModules(
  runModules: RunModuleSummary[],
): Promise<ModuleContext[]> {
  if (runModules.length === 0) {
    return [];
  }

  const moduleDefinitionIds = runModules.map(
    (runModule) => runModule.moduleDefinitionId,
  );
  const activeAttemptIds = [
    ...new Set(
      runModules
        .map((runModule) => runModule.activeAttemptId)
        .filter((attemptId): attemptId is string => attemptId !== null),
    ),
  ];
  const artifactAttemptIds = runModules.map(
    (runModule) =>
      runModule.activeAttemptId ?? runModule.acceptedAttemptId ?? null,
  );

  const [
    questionsByModuleDefinitionId,
    attemptsById,
    responsesByAttemptId,
    artifactsByModuleDefinitionId,
  ] = await Promise.all([
    loadQuestionsByModuleDefinitionIds([...new Set(moduleDefinitionIds)]),
    loadAttemptsByIds(activeAttemptIds),
    loadResponsesByAttemptIds(activeAttemptIds),
    loadArtifactsByModuleAttempts(moduleDefinitionIds, artifactAttemptIds),
  ]);

  return runModules.map((runModule) =>
    assembleModuleContext(
      runModule,
      attemptsById,
      questionsByModuleDefinitionId,
      responsesByAttemptId,
      artifactsByModuleDefinitionId,
    ),
  );
}

/**
 * Loads every ModuleContext on the Founder's active Run in one pass:
 * resolves the Run once via listRunModules, then builds each context from
 * four batched queries (questions, attempts, responses, artifacts).
 */
export async function listModuleContextsForActiveRun(
  actor: ActorContext,
): Promise<ModuleContext[]> {
  assertRole(actor, ["founder"]);
  const { modules } = await listRunModules(actor);
  return buildModuleContextsFromRunModules(modules);
}

/**
 * Loads everything a Facilitator (the AI client, via MCP) needs to run
 * one Module: the current Run/Module state, its active Attempt (if any),
 * every active Question joined with the current Attempt's Response (if
 * any), the resume point, and every Artifact's latest-version metadata.
 */
export async function getModuleContext(actor: ActorContext, input: unknown): Promise<ModuleContext> {
  assertRole(actor, ["founder"]);
  const runModule = await getRunModuleByKey(actor, input);
  const [context] = await buildModuleContextsFromRunModules([runModule]);
  if (!context) {
    throw new ServiceError(
      "INTERNAL_INVARIANT_ERROR",
      "Module context assembly returned no row.",
    );
  }
  return context;
}
