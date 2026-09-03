import { pool } from "@ai-catalyst/db";
import type {
  ModuleContextPrepDocument,
  ModuleContextPrompt,
} from "@ai-catalyst/shared";

import type { AttemptRow } from "@ai-catalyst/services/attempt/internal/rows";
import type {
  ArtifactRow,
  ArtifactRowWithModuleId,
  PromptRow,
  QuestionRow,
  QuestionRowWithModuleId,
  ResponseLookupRow,
  ResponseLookupRowWithAttemptId,
} from "@ai-catalyst/services/module/internal/context-rows";

export function groupRowsByKey<T, K extends string | number>(
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

export async function loadAttemptsByIds(
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
export async function loadLatestAttemptIdsByRunModuleIds(
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

export async function loadQuestionsByModuleDefinitionIds(
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

export async function loadResponsesByAttemptIds(
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

export async function loadArtifactsByModuleAttempts(
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

export async function loadPromptsByModuleDefinitionIds(
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

/**
 * Prep documents per run module, live rows only — an uploaded file or an
 * assistant-saved summary (no storage_objects row for the latter, hence
 * the left join).
 *
 * Metadata only, deliberately. Content is never inlined into Module
 * context: a 20 MB PDF would swamp the payload, and the reader fetches
 * exactly the documents it decides to open via get_prep_document.
 */
export async function loadPrepDocumentsByRunModuleIds(
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
    document_kind: "interview_transcript" | "other";
    interview_count: number | null;
    created_at: Date;
  }>(
    `select d.id, d.program_run_module_id, d.original_filename,
            d.content_type, s.size_bytes, d.document_kind, d.interview_count,
            d.created_at
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
      documentKind: row.document_kind,
      interviewCount: row.interview_count,
      uploadedAt: row.created_at.toISOString(),
    });
    byRunModuleId.set(row.program_run_module_id, list);
  }

  return byRunModuleId;
}
