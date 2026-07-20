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
  ModuleContextPrompt,
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

interface PromptRow {
  module_definition_id: string;
  purpose: string;
  prompt_key: string;
  version_number: number;
  content: string;
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

// When active_attempt_id is cleared (e.g. after validation_failed), the
// latest Attempt for the Module still holds the Founder's answers — load
// those ids so context can surface them as displayAttempt.
async function loadLatestAttemptIdsByRunModuleIds(
  runModuleIds: string[],
): Promise<Map<string, string>> {
  if (runModuleIds.length === 0) {
    return new Map();
  }
  const result = await pool.query<{
    program_run_module_id: string;
    id: string;
  }>(
    `select distinct on (program_run_module_id) program_run_module_id, id
     from module_attempts
     where program_run_module_id = any($1::uuid[])
     order by program_run_module_id, attempt_number desc`,
    [runModuleIds],
  );
  return new Map(result.rows.map((row) => [row.program_run_module_id, row.id]));
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

async function loadPromptsByModuleDefinitionIds(
  moduleDefinitionIds: string[],
): Promise<Map<string, ModuleContextPrompt[]>> {
  if (moduleDefinitionIds.length === 0) {
    return new Map();
  }
  const result = await pool.query<PromptRow>(
    `select mpb.module_definition_id, mpb.purpose, pd.prompt_key,
            pv.version_number, pv.content
     from module_prompt_bindings mpb
     join prompt_versions pv on pv.id = mpb.prompt_version_id
     join prompt_definitions pd on pd.id = pv.prompt_definition_id
     where mpb.module_definition_id = any($1::uuid[])
     order by mpb.module_definition_id, mpb.purpose, mpb.sequence_index`,
    [moduleDefinitionIds],
  );
  const grouped = groupRowsByKey(result.rows, (row) => row.module_definition_id);
  return new Map(
    [...grouped.entries()].map(([moduleDefinitionId, rows]) => [
      moduleDefinitionId,
      rows.map(
        (row): ModuleContextPrompt => ({
          purpose: row.purpose,
          promptKey: row.prompt_key,
          versionNumber: row.version_number,
          content: row.content,
        }),
      ),
    ]),
  );
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

function attemptHasAnsweredResponses(
  attemptId: string,
  responsesByAttemptId: Map<string, Map<string, ResponseLookupRow>>,
): boolean {
  const responses = responsesByAttemptId.get(attemptId);
  if (!responses) {
    return false;
  }
  for (const response of responses.values()) {
    if (response.response_status === "answered" || response.response_status === "skipped") {
      return true;
    }
  }
  return false;
}

function assembleModuleContext(
  runModule: RunModuleSummary,
  fallbackDisplayAttemptId: string | null,
  attemptsById: Map<string, AttemptRow>,
  questionsByModuleDefinitionId: Map<string, QuestionRow[]>,
  responsesByAttemptId: Map<string, Map<string, ResponseLookupRow>>,
  artifactsByModuleDefinitionId: Map<string, ArtifactRow[]>,
  promptsByModuleDefinitionId: Map<string, ModuleContextPrompt[]>,
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

  // Read surface: show prior answers when the active Attempt is a fresh
  // empty Retry (based_on still holds them), or when active is cleared
  // after validation_failed. Write surface stays on activeAttempt.
  let displayAttempt: ModuleAttempt | null = activeAttempt;
  if (
    activeAttempt &&
    !attemptHasAnsweredResponses(activeAttempt.id, responsesByAttemptId) &&
    activeAttempt.basedOnAttemptId
  ) {
    const priorRow = attemptsById.get(activeAttempt.basedOnAttemptId);
    if (priorRow) {
      displayAttempt = mapAttemptRow(priorRow);
    }
  } else if (!displayAttempt && fallbackDisplayAttemptId) {
    const displayRow = attemptsById.get(fallbackDisplayAttemptId);
    if (displayRow) {
      displayAttempt = mapAttemptRow(displayRow);
    }
  }

  const questionRows =
    questionsByModuleDefinitionId.get(runModule.moduleDefinitionId) ?? [];
  const readResponseMap = displayAttempt
    ? (responsesByAttemptId.get(displayAttempt.id) ?? new Map())
    : new Map<string, ResponseLookupRow>();
  const writeAttemptId = activeAttempt?.id ?? displayAttempt?.id ?? null;
  const writeResponseMap = writeAttemptId
    ? (responsesByAttemptId.get(writeAttemptId) ?? new Map())
    : new Map<string, ResponseLookupRow>();

  const questions: ModuleContextQuestion[] = questionRows.map((row) => {
    const response = readResponseMap.get(row.question_key);
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
    questionRows.find((row) => !writeResponseMap.has(row.question_key))?.question_key ??
    null;

  const artifactRows =
    artifactsByModuleDefinitionId.get(runModule.moduleDefinitionId) ?? [];

  return {
    runModule,
    activeAttempt,
    displayAttempt,
    resumeQuestionKey,
    questions,
    artifacts: mapArtifactSummaries(artifactRows),
    prompts: promptsByModuleDefinitionId.get(runModule.moduleDefinitionId) ?? [],
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
  const runModuleIds = runModules.map((runModule) => runModule.id);

  const latestAttemptIdsByRunModule =
    await loadLatestAttemptIdsByRunModuleIds(runModuleIds);

  const fallbackDisplayAttemptIds = runModules.map((runModule) => {
    if (runModule.activeAttemptId) {
      return runModule.activeAttemptId;
    }
    if (runModule.acceptedAttemptId) {
      return runModule.acceptedAttemptId;
    }
    return latestAttemptIdsByRunModule.get(runModule.id) ?? null;
  });

  const seedAttemptIds = [
    ...new Set(
      [
        ...fallbackDisplayAttemptIds,
        ...runModules.map((runModule) => runModule.activeAttemptId),
      ].filter((id): id is string => id !== null),
    ),
  ];

  const [
    questionsByModuleDefinitionId,
    seedAttemptsById,
    promptsByModuleDefinitionId,
  ] = await Promise.all([
    loadQuestionsByModuleDefinitionIds([...new Set(moduleDefinitionIds)]),
    loadAttemptsByIds(seedAttemptIds),
    loadPromptsByModuleDefinitionIds([...new Set(moduleDefinitionIds)]),
  ]);

  // Empty Retry Attempts still need their based_on Attempt loaded so
  // prior answers remain visible on displayAttempt.
  const basedOnIds = [...seedAttemptsById.values()]
    .map((row) => row.based_on_attempt_id)
    .filter((id): id is string => id !== null);
  const attemptIdsToLoad = [...new Set([...seedAttemptIds, ...basedOnIds])];

  const [attemptsById, responsesByAttemptId] = await Promise.all([
    loadAttemptsByIds(attemptIdsToLoad),
    loadResponsesByAttemptIds(attemptIdsToLoad),
  ]);

  const artifactAttemptIds = runModules.map((runModule, index) => {
    const activeId = runModule.activeAttemptId;
    if (activeId && attemptHasAnsweredResponses(activeId, responsesByAttemptId)) {
      return activeId;
    }
    if (activeId) {
      const active = attemptsById.get(activeId);
      if (active?.based_on_attempt_id) {
        return active.based_on_attempt_id;
      }
      return activeId;
    }
    return fallbackDisplayAttemptIds[index] ?? null;
  });

  const artifactsByModuleDefinitionId = await loadArtifactsByModuleAttempts(
    moduleDefinitionIds,
    artifactAttemptIds,
  );

  return runModules.map((runModule, index) =>
    assembleModuleContext(
      runModule,
      fallbackDisplayAttemptIds[index] ?? null,
      attemptsById,
      questionsByModuleDefinitionId,
      responsesByAttemptId,
      artifactsByModuleDefinitionId,
      promptsByModuleDefinitionId,
    ),
  );
}

/**
 * Loads every ModuleContext on the Founder's active Run in one pass:
 * resolves the Run once via listRunModules, then builds each context from
 * batched queries (questions, attempts, responses, artifacts, prompts).
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
 * one Module: the current Run/Module state, its active/display Attempt,
 * every active Question joined with that Attempt's Response, bound
 * Prompts, the resume point, and every Artifact's latest-version metadata.
 */
export async function getModuleContext(
  actor: ActorContext,
  input: unknown,
): Promise<ModuleContext> {
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
