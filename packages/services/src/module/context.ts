import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { loggerForService } from "@ai-catalyst/observability/logger";
import { SERVICE_NAMES } from "@ai-catalyst/observability/service-names";
import type {
  ArtifactSubmissionStatus,
  ModuleAttempt,
  ModuleAttemptStatus,
  ModuleContext,
  ModuleContextArtifactSummary,
  ModuleContextPrepDocument,
  ModuleContextPrompt,
  ModuleContextQuestion,
  ModuleResponseStatus,
  ModuleResponseType,
  RunModuleSummary,
} from "@ai-catalyst/shared";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import {
  mapAttemptRow,
  type AttemptRow,
} from "@ai-catalyst/services/attempt/internal/rows";
import {
  getRunModuleByKey,
  listRunModules,
} from "@ai-catalyst/services/workflow";

const log = loggerForService(SERVICE_NAMES.services);

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
  renderer_key: string | null;
  template_markdown: string | null;
  submission_version_number: number | null;
  submission_status: ArtifactSubmissionStatus | null;
  submission_submitted_at: Date | null;
  submission_updated_at: Date | null;
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
            ad.required_filename, ad.sequence_index, ad.renderer_key,
            ad.output_config->>'templateMarkdown' as template_markdown,
            s.version_number as submission_version_number,
            s.status as submission_status,
            s.submitted_at as submission_submitted_at,
            s.updated_at as submission_updated_at
     from module_ctx mc
     join artifact_definitions ad on ad.module_definition_id = mc.module_definition_id and ad.status <> 'archived'
     left join lateral (
       select version_number, status, submitted_at, updated_at
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
  const grouped = groupRowsByKey(
    result.rows,
    (row) => row.module_definition_id,
  );
  return new Map(
    [...grouped.entries()].map(([moduleDefinitionId, rows]) => [
      moduleDefinitionId,
      rows.map((row): ModuleContextPrompt => ({
        purpose: row.purpose,
        promptKey: row.prompt_key,
        versionNumber: row.version_number,
        content: row.content,
      })),
    ]),
  );
}

function mapArtifactSummaries(
  rows: ArtifactRow[],
): ModuleContextArtifactSummary[] {
  return rows.map((row) => {
    const workbookSupported = row.renderer_key !== null;
    return {
      artifactKey: row.artifact_key,
      name: row.name,
      isRequired: row.is_required,
      requiredFilename: row.required_filename,
      templateMarkdown: row.template_markdown,
      latestSubmission:
        row.submission_version_number === null ||
        row.submission_updated_at === null
          ? null
          : {
              versionNumber: row.submission_version_number,
              status: row.submission_status as ArtifactSubmissionStatus,
              submittedAt: row.submission_submitted_at?.toISOString() ?? null,
              updatedAt: row.submission_updated_at.toISOString(),
            },
      workbookSupported,
      // "Confirmed" per the operational-workbooks plan: submitted, never a
      // draft or an unvalidated save. The lateral join above already
      // excludes superseded/deleted, so 'submitted' is the only non-draft
      // status that can reach here.
      workbookAvailable:
        workbookSupported && row.submission_status === "submitted",
      workbookFormat: workbookSupported ? "pdf" : null,
    };
  });
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
    if (
      response.response_status === "answered" ||
      response.response_status === "skipped"
    ) {
      return true;
    }
  }
  return false;
}

/**
 * True when the Attempt has answered/skipped at least one of the Module's
 * current Question keys. Prefer this over {@link attemptHasAnsweredResponses}
 * for checklist hydration: a Retry that kept stale keys from an earlier
 * schema must not "own" the checklist while every live key is blank.
 */
function attemptHasCurrentQuestionResponses(
  attemptId: string,
  questionKeys: readonly string[],
  responsesByAttemptId: Map<string, Map<string, ResponseLookupRow>>,
): boolean {
  if (questionKeys.length === 0) {
    return attemptHasAnsweredResponses(attemptId, responsesByAttemptId);
  }
  const responses = responsesByAttemptId.get(attemptId);
  if (!responses) {
    return false;
  }
  for (const key of questionKeys) {
    const response = responses.get(key);
    if (
      response &&
      (response.response_status === "answered" ||
        response.response_status === "skipped")
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Walk active → based_on → … and return the nearest Attempt that still has
 * usable Responses for the current Question keys. Empty Retries that reach
 * ready_for_review by re-saving Artifacts keep the prior checklist visible
 * even when the based_on chain is deeper than one hop.
 */
function resolveReadResponseAttemptId(
  startAttemptId: string | null,
  questionKeys: readonly string[],
  attemptsById: Map<string, AttemptRow>,
  responsesByAttemptId: Map<string, Map<string, ResponseLookupRow>>,
): string | null {
  let cursor = startAttemptId;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    if (
      attemptHasCurrentQuestionResponses(
        cursor,
        questionKeys,
        responsesByAttemptId,
      )
    ) {
      return cursor;
    }
    cursor = attemptsById.get(cursor)?.based_on_attempt_id ?? null;
  }
  return startAttemptId;
}

/** Attempts that have finished (or nearly finished) owning their own outputs. */
function isAttemptArtifactOwner(status: ModuleAttemptStatus): boolean {
  return (
    status === "submitted" ||
    status === "ready_for_review" ||
    status === "accepted"
  );
}

function assembleModuleContext(
  runModule: RunModuleSummary,
  fallbackDisplayAttemptId: string | null,
  attemptsById: Map<string, AttemptRow>,
  questionsByModuleDefinitionId: Map<string, QuestionRow[]>,
  responsesByAttemptId: Map<string, Map<string, ResponseLookupRow>>,
  artifactsByModuleDefinitionId: Map<string, ArtifactRow[]>,
  promptsByModuleDefinitionId: Map<string, ModuleContextPrompt[]>,
  prepDocumentsByRunModuleId: Map<string, ModuleContextPrepDocument[]>,
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
  // after validation_failed. Never do this once the active Attempt has
  // reached submitted / ready_for_review / accepted — those own their own
  // Responses and Artifacts (a Retry can save outputs without re-answering
  // every Question; falling back would hide the successful work).
  // Write surface stays on activeAttempt.
  let displayAttempt: ModuleAttempt | null = activeAttempt;
  if (
    activeAttempt &&
    !isAttemptArtifactOwner(activeAttempt.status) &&
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
  const questionKeys = questionRows.map((row) => row.question_key);
  // Question checklist: walk the based_on chain for the nearest Attempt
  // that still has Responses for the current Question keys. A Retry that
  // reaches ready_for_review by re-saving Artifacts without re-answering
  // must keep the prior checklist visible (displayAttempt stays the
  // artifact owner for status / Saved versions).
  const readResponseAttemptId = resolveReadResponseAttemptId(
    activeAttempt?.id ?? displayAttempt?.id ?? null,
    questionKeys,
    attemptsById,
    responsesByAttemptId,
  );
  const readResponseMap = readResponseAttemptId
    ? (responsesByAttemptId.get(readResponseAttemptId) ?? new Map())
    : new Map<string, ResponseLookupRow>();
  // Write surface is activeAttempt only — never fall back to displayAttempt
  // (often terminal after validation_failed; Retries start empty).
  const writeResponseMap = activeAttempt
    ? (responsesByAttemptId.get(activeAttempt.id) ??
      new Map<string, ResponseLookupRow>())
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
  // First unanswered key on the write surface (caller must start_module_attempt first).
  const resumeQuestionKey =
    questionRows.find((row) => !writeResponseMap.has(row.question_key))
      ?.question_key ?? null;

  const artifactRows =
    artifactsByModuleDefinitionId.get(runModule.moduleDefinitionId) ?? [];
  const artifacts = mapArtifactSummaries(artifactRows);
  const answered = questions.filter(
    (question) =>
      question.responseStatus === "answered" ||
      question.responseStatus === "skipped",
  ).length;
  const total = questions.length;

  // Diagnostic only — never write module_events on the hydration path.
  // Surfaces the historical "4/4 → 0/4 with Saved artefacts" class of bugs.
  if (
    activeAttempt &&
    isAttemptArtifactOwner(activeAttempt.status) &&
    artifacts.length > 0 &&
    total > 0 &&
    answered === 0
  ) {
    log.warn({
      event: "module_checklist_state_mismatch",
      message: "Module checklist state does not match artifact owner attempt",
      module_key: runModule.moduleKey,
      attempt_id: activeAttempt.id,
      read_attempt_id: readResponseAttemptId,
      active_attempt_id: activeAttempt.id,
      answered,
      total,
      artifact_count: artifacts.length,
      attempt_status: activeAttempt.status,
    });
  }

  return {
    runModule,
    activeAttempt,
    displayAttempt,
    resumeQuestionKey,
    questions,
    artifacts,
    prompts:
      promptsByModuleDefinitionId.get(runModule.moduleDefinitionId) ?? [],
    prepDocuments: prepDocumentsByRunModuleId.get(runModule.id) ?? [],
  };
}

/**
 * Prep documents per run module, live rows only — an uploaded file or an
 * assistant-saved summary (no storage_objects row for the latter, hence
 * the left join).
 *
 * Metadata only, deliberately. Content is never inlined into Module
 * context: a 20 MB PDF would swamp the payload, and the reader fetches
 * exactly the documents it decides to open via get_prep_document.
 */
async function loadPrepDocumentsByRunModuleIds(
  runModuleIds: string[],
): Promise<Map<string, ModuleContextPrepDocument[]>> {
  const byRunModuleId = new Map<string, ModuleContextPrepDocument[]>();
  if (runModuleIds.length === 0) {
    return byRunModuleId;
  }

  const result = await pool.query<{
    id: string;
    program_run_module_id: string;
    original_filename: string;
    content_type: string;
    size_bytes: string | null;
    created_at: Date;
  }>(
    `select d.id, d.program_run_module_id, d.original_filename,
            d.content_type, s.size_bytes, d.created_at
     from module_prep_documents d
     left join storage_objects s on s.id = d.storage_object_id
     where d.program_run_module_id = any($1::uuid[])
       and d.withdrawn_at is null
     order by d.created_at asc`,
    [runModuleIds],
  );

  for (const row of result.rows) {
    const list = byRunModuleId.get(row.program_run_module_id) ?? [];
    list.push({
      id: row.id,
      filename: row.original_filename,
      contentType: row.content_type,
      sizeBytes: row.size_bytes === null ? null : Number(row.size_bytes),
      uploadedAt: row.created_at.toISOString(),
    });
    byRunModuleId.set(row.program_run_module_id, list);
  }

  return byRunModuleId;
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

  // Empty Retry Attempts still need their based_on chain loaded so prior
  // answers remain visible on the checklist (one hop is not enough when
  // an intermediate Retry also never re-answered).
  const attemptsById = new Map(seedAttemptsById);
  let frontier = [...seedAttemptsById.values()]
    .map((row) => row.based_on_attempt_id)
    .filter((id): id is string => id !== null && !attemptsById.has(id));
  while (frontier.length > 0) {
    const next = await loadAttemptsByIds(frontier);
    for (const [id, row] of next) {
      attemptsById.set(id, row);
    }
    frontier = [...next.values()]
      .map((row) => row.based_on_attempt_id)
      .filter((id): id is string => id !== null && !attemptsById.has(id));
  }

  const attemptIdsToLoad = [...attemptsById.keys()];
  const responsesByAttemptId =
    await loadResponsesByAttemptIds(attemptIdsToLoad);

  // Artifacts follow the active Attempt whenever it owns its outputs
  // (submitted / ready_for_review / accepted) or already has answers.
  // Only an empty in-progress Retry falls back to based_on so prior
  // drafts remain visible while the Founder restarts.
  const artifactAttemptIds = runModules.map((runModule, index) => {
    const activeId = runModule.activeAttemptId;
    if (!activeId) {
      return fallbackDisplayAttemptIds[index] ?? null;
    }
    const active = attemptsById.get(activeId);
    if (active && isAttemptArtifactOwner(active.status)) {
      return activeId;
    }
    if (attemptHasAnsweredResponses(activeId, responsesByAttemptId)) {
      return activeId;
    }
    if (active?.based_on_attempt_id) {
      return active.based_on_attempt_id;
    }
    return activeId;
  });

  const [artifactsByModuleDefinitionId, prepDocumentsByRunModuleId] =
    await Promise.all([
      loadArtifactsByModuleAttempts(moduleDefinitionIds, artifactAttemptIds),
      // Keyed by run module, not by attempt: prep is uploaded on the Work
      // step before any attempt exists, and stays visible across retries.
      loadPrepDocumentsByRunModuleIds(runModuleIds),
    ]);

  return runModules.map((runModule, index) =>
    assembleModuleContext(
      runModule,
      fallbackDisplayAttemptIds[index] ?? null,
      attemptsById,
      questionsByModuleDefinitionId,
      responsesByAttemptId,
      artifactsByModuleDefinitionId,
      promptsByModuleDefinitionId,
      prepDocumentsByRunModuleId,
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
