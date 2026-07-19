import type { PoolClient } from "pg";

import { diffFields, diffKeySets } from "../compare.js";
import { ContentSeedError } from "../errors.js";
import type { ArtifactContent, ModuleContent, QuestionContent } from "../types.js";

export interface ReconciledModule {
  moduleId: string;
  moduleKey: string;
  isPublishable: boolean;
}

const MODULE_FIELDS = [
  "sequence_index",
  "title",
  "subtitle",
  "description",
  "objective",
  "module_type",
  "is_required",
  "allow_revisions",
  "completion_mode",
  "estimated_minutes",
] as const;

const QUESTION_FIELDS = [
  "sequence_index",
  "question_group",
  "question_text",
  "help_text",
  "placeholder_text",
  "response_type",
  "is_required",
  "allow_skip",
  "options",
  "conditions",
] as const;

const ARTIFACT_FIELDS = [
  "sequence_index",
  "name",
  "description",
  "is_required",
  "artifact_type",
  "source_format",
  "output_format",
  "required_filename",
  "renderer_key",
  "validator_key",
  "allowed_mime_types",
  "max_file_size_bytes",
  "max_files",
  "validation_config",
  "output_config",
] as const;

function moduleContentRow(module: ModuleContent): Record<string, unknown> {
  return {
    sequence_index: module.sequenceIndex,
    title: module.title,
    subtitle: module.subtitle,
    description: module.description,
    objective: module.objective,
    module_type: module.moduleType,
    is_required: module.isRequired,
    allow_revisions: module.allowRevisions,
    completion_mode: module.completionMode,
    estimated_minutes: module.estimatedMinutes,
  };
}

function questionContentRow(question: QuestionContent): Record<string, unknown> {
  return {
    sequence_index: question.sequenceIndex,
    question_group: question.questionGroup,
    question_text: question.questionText,
    help_text: question.helpText,
    placeholder_text: question.placeholderText,
    response_type: question.responseType,
    is_required: question.isRequired,
    allow_skip: question.allowSkip,
    options: question.options,
    conditions: question.conditions,
  };
}

function artifactContentRow(artifact: ArtifactContent): Record<string, unknown> {
  return {
    sequence_index: artifact.sequenceIndex,
    name: artifact.name,
    description: artifact.description,
    is_required: artifact.isRequired,
    artifact_type: artifact.artifactType,
    source_format: artifact.sourceFormat,
    output_format: artifact.outputFormat,
    required_filename: artifact.requiredFilename,
    renderer_key: artifact.rendererKey,
    validator_key: artifact.validatorKey,
    allowed_mime_types: artifact.allowedMimeTypes,
    max_file_size_bytes: artifact.maxFileSizeBytes,
    max_files: artifact.maxFiles,
    validation_config: artifact.validationConfig,
    output_config: artifact.outputConfig,
  };
}

// `isDraftEditable` reflects the parent program_version's status, fetched
// once per run ? module_definitions/module_questions/artifact_definitions
// have no lifecycle field of their own, so their immutability once
// published is enforced here rather than by a DB trigger.
async function reconcileModuleDefinition(
  client: PoolClient,
  programVersionId: string,
  isDraftEditable: boolean,
  module: ModuleContent,
): Promise<string> {
  const existing = await client.query<
    { id: string } & Record<(typeof MODULE_FIELDS)[number], unknown>
  >(
    `select id, ${MODULE_FIELDS.join(", ")}
     from module_definitions
     where program_version_id = $1 and module_key = $2`,
    [programVersionId, module.moduleKey],
  );

  const expected = moduleContentRow(module);
  const row = existing.rows[0];

  if (!row) {
    const inserted = await client.query<{ id: string }>(
      `insert into module_definitions
         (program_version_id, module_key, sequence_index, title, subtitle, description,
          objective, module_type, is_required, allow_revisions, completion_mode,
          estimated_minutes, status)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'draft')
       returning id`,
      [
        programVersionId,
        module.moduleKey,
        expected.sequence_index,
        expected.title,
        expected.subtitle,
        expected.description,
        expected.objective,
        expected.module_type,
        expected.is_required,
        expected.allow_revisions,
        expected.completion_mode,
        expected.estimated_minutes,
      ],
    );
    return inserted.rows[0].id;
  }

  const differing = diffFields(expected, row, MODULE_FIELDS);
  if (differing.length === 0) {
    return row.id;
  }

  if (!isDraftEditable) {
    throw new ContentSeedError(
      "PUBLISHED_CONTENT_MISMATCH",
      `module_definitions "${module.moduleKey}" no longer matches the content constants ` +
        `(fields: ${differing.join(", ")}), and its program_version is no longer draft. ` +
        "Publish a new program_version instead of editing published content.",
    );
  }

  await client.query(
    `update module_definitions
     set sequence_index = $1, title = $2, subtitle = $3, description = $4, objective = $5,
         module_type = $6, is_required = $7, allow_revisions = $8, completion_mode = $9,
         estimated_minutes = $10
     where id = $11`,
    [
      expected.sequence_index,
      expected.title,
      expected.subtitle,
      expected.description,
      expected.objective,
      expected.module_type,
      expected.is_required,
      expected.allow_revisions,
      expected.completion_mode,
      expected.estimated_minutes,
      row.id,
    ],
  );
  return row.id;
}

async function reconcileModuleQuestions(
  client: PoolClient,
  moduleDefinitionId: string,
  isDraftEditable: boolean,
  questions: QuestionContent[],
): Promise<void> {
  const actual = await client.query<{ question_key: string }>(
    `select question_key from module_questions where module_definition_id = $1`,
    [moduleDefinitionId],
  );

  const { extra } = diffKeySets(
    questions.map((question) => question.questionKey),
    actual.rows.map((row) => row.question_key),
  );
  if (extra.length > 0) {
    throw new ContentSeedError(
      "CONTENT_GRAPH_MISMATCH",
      `module_questions has unexpected rows not present in the content constants: ${extra.join(", ")}.`,
    );
  }

  for (const question of questions) {
    const existing = await client.query<
      { id: string } & Record<(typeof QUESTION_FIELDS)[number], unknown>
    >(
      `select id, ${QUESTION_FIELDS.join(", ")}
       from module_questions
       where module_definition_id = $1 and question_key = $2`,
      [moduleDefinitionId, question.questionKey],
    );

    const expected = questionContentRow(question);
    const row = existing.rows[0];

    if (!row) {
      await client.query(
        `insert into module_questions
           (module_definition_id, question_key, sequence_index, question_group, question_text,
            help_text, placeholder_text, response_type, is_required, allow_skip, options,
            conditions, status)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'active')`,
        [
          moduleDefinitionId,
          question.questionKey,
          expected.sequence_index,
          expected.question_group,
          expected.question_text,
          expected.help_text,
          expected.placeholder_text,
          expected.response_type,
          expected.is_required,
          expected.allow_skip,
          JSON.stringify(expected.options),
          JSON.stringify(expected.conditions),
        ],
      );
      continue;
    }

    const differing = diffFields(expected, row, QUESTION_FIELDS);
    if (differing.length === 0) {
      continue;
    }

    if (!isDraftEditable) {
      throw new ContentSeedError(
        "PUBLISHED_CONTENT_MISMATCH",
        `module_questions "${question.questionKey}" no longer matches the content constants ` +
          `(fields: ${differing.join(", ")}), and its program_version is no longer draft.`,
      );
    }

    await client.query(
      `update module_questions
       set sequence_index = $1, question_group = $2, question_text = $3, help_text = $4,
           placeholder_text = $5, response_type = $6, is_required = $7, allow_skip = $8,
           options = $9, conditions = $10
       where id = $11`,
      [
        expected.sequence_index,
        expected.question_group,
        expected.question_text,
        expected.help_text,
        expected.placeholder_text,
        expected.response_type,
        expected.is_required,
        expected.allow_skip,
        JSON.stringify(expected.options),
        JSON.stringify(expected.conditions),
        row.id,
      ],
    );
  }
}

async function reconcileArtifactDefinitions(
  client: PoolClient,
  moduleDefinitionId: string,
  isDraftEditable: boolean,
  artifacts: ArtifactContent[],
): Promise<void> {
  const actual = await client.query<{ artifact_key: string }>(
    `select artifact_key from artifact_definitions where module_definition_id = $1`,
    [moduleDefinitionId],
  );

  const { extra } = diffKeySets(
    artifacts.map((artifact) => artifact.artifactKey),
    actual.rows.map((row) => row.artifact_key),
  );
  if (extra.length > 0) {
    throw new ContentSeedError(
      "CONTENT_GRAPH_MISMATCH",
      `artifact_definitions has unexpected rows not present in the content constants: ${extra.join(", ")}.`,
    );
  }

  for (const artifact of artifacts) {
    const existing = await client.query<
      { id: string } & Record<(typeof ARTIFACT_FIELDS)[number], unknown>
    >(
      `select id, ${ARTIFACT_FIELDS.join(", ")}
       from artifact_definitions
       where module_definition_id = $1 and artifact_key = $2`,
      [moduleDefinitionId, artifact.artifactKey],
    );

    const expected = artifactContentRow(artifact);
    const row = existing.rows[0];
    // `max_file_size_bytes` is a bigint column, so node-postgres returns it
    // as a string rather than a number ? normalize before comparing.
    if (row && typeof row.max_file_size_bytes === "string") {
      row.max_file_size_bytes = Number(row.max_file_size_bytes);
    }

    if (!row) {
      await client.query(
        `insert into artifact_definitions
           (module_definition_id, artifact_key, sequence_index, name, description, is_required,
            artifact_type, source_format, output_format, required_filename, renderer_key,
            validator_key, allowed_mime_types, max_file_size_bytes, max_files, validation_config,
            output_config)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
          moduleDefinitionId,
          artifact.artifactKey,
          expected.sequence_index,
          expected.name,
          expected.description,
          expected.is_required,
          expected.artifact_type,
          expected.source_format,
          expected.output_format,
          expected.required_filename,
          expected.renderer_key,
          expected.validator_key,
          expected.allowed_mime_types,
          expected.max_file_size_bytes,
          expected.max_files,
          JSON.stringify(expected.validation_config),
          JSON.stringify(expected.output_config),
        ],
      );
      continue;
    }

    const differing = diffFields(expected, row, ARTIFACT_FIELDS);
    if (differing.length === 0) {
      continue;
    }

    if (!isDraftEditable) {
      throw new ContentSeedError(
        "PUBLISHED_CONTENT_MISMATCH",
        `artifact_definitions "${artifact.artifactKey}" no longer matches the content constants ` +
          `(fields: ${differing.join(", ")}), and its program_version is no longer draft.`,
      );
    }

    await client.query(
      `update artifact_definitions
       set sequence_index = $1, name = $2, description = $3, is_required = $4, artifact_type = $5,
           source_format = $6, output_format = $7, required_filename = $8, renderer_key = $9,
           validator_key = $10, allowed_mime_types = $11, max_file_size_bytes = $12,
           max_files = $13, validation_config = $14, output_config = $15
       where id = $16`,
      [
        expected.sequence_index,
        expected.name,
        expected.description,
        expected.is_required,
        expected.artifact_type,
        expected.source_format,
        expected.output_format,
        expected.required_filename,
        expected.renderer_key,
        expected.validator_key,
        expected.allowed_mime_types,
        expected.max_file_size_bytes,
        expected.max_files,
        JSON.stringify(expected.validation_config),
        JSON.stringify(expected.output_config),
        row.id,
      ],
    );
  }
}

/**
 * Reconciles every Module in `modules` (Module 0, Module 1, and the
 * Module 2-6 placeholders) plus their nested Questions and Artifact
 * Definitions against `programVersionId`. Performs a full graph
 * completeness check at the Module level (any module_definitions row under
 * this Program Version whose key is not in `modules` is rejected) in
 * addition to the per-Module Question/Artifact checks above.
 */
export async function reconcileModules(
  client: PoolClient,
  programVersionId: string,
  isDraftEditable: boolean,
  modules: ModuleContent[],
): Promise<ReconciledModule[]> {
  const actual = await client.query<{ module_key: string }>(
    `select module_key from module_definitions where program_version_id = $1`,
    [programVersionId],
  );

  const { extra } = diffKeySets(
    modules.map((module) => module.moduleKey),
    actual.rows.map((row) => row.module_key),
  );
  if (extra.length > 0) {
    throw new ContentSeedError(
      "CONTENT_GRAPH_MISMATCH",
      `program_version has unexpected module_definitions rows not present in the content constants: ${extra.join(", ")}.`,
    );
  }

  const results: ReconciledModule[] = [];
  for (const module of modules) {
    const moduleId = await reconcileModuleDefinition(
      client,
      programVersionId,
      isDraftEditable,
      module,
    );
    await reconcileModuleQuestions(client, moduleId, isDraftEditable, module.questions);
    await reconcileArtifactDefinitions(client, moduleId, isDraftEditable, module.artifacts);
    results.push({ moduleId, moduleKey: module.moduleKey, isPublishable: module.isPublishable });
  }
  return results;
}
