import type { PoolClient } from "pg";

import { validateConfigForValidator } from "../../artifact/internal/validators/rule-schema.js";
import { diffFields } from "../compare.js";
import { ContentSeedError } from "../errors.js";
import type {
  ArtifactContent,
  ModuleContent,
  QuestionContent,
} from "../types.js";
import {
  applyOrderedRowsPlan,
  loadExistingOrderedRows,
  planOrderedRows,
  type OrderedRowsPlan,
} from "./reconcile-ordered-rows.js";

export interface ReconciledModule {
  moduleId: string;
  moduleKey: string;
  isPublishable: boolean;
}

// sequence_index omitted — ordering is owned by reconcile-ordered-rows.ts before these upsert loops; including it here could conflict.
const MODULE_FIELDS = [
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

function questionContentRow(
  question: QuestionContent,
): Record<string, unknown> {
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

function artifactContentRow(
  artifact: ArtifactContent,
): Record<string, unknown> {
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

// A plan's toArchive/toRevive/missingKeys describe a change to WHICH rows
// exist (the content graph); resequenceStaying alone describes a pure
// reorder of rows that all still exist. Both are content-lock-gated, but
// the graph-shaped ones reuse the same error code the old graph-completeness
// check used (CONTENT_GRAPH_MISMATCH); a pure reorder reuses the same code
// a plain field diff would (PUBLISHED_CONTENT_MISMATCH) — sequence_index
// used to be diffed as an ordinary field before it moved into this plan.
function isGraphShapeChange(plan: OrderedRowsPlan): boolean {
  return (
    plan.toArchive.length > 0 ||
    plan.toRevive.length > 0 ||
    plan.missingKeys.length > 0
  );
}

function assertPlanAllowed(
  plan: OrderedRowsPlan,
  isContentEditable: boolean,
  allowArchive: boolean,
  describeTarget: string,
): void {
  if (!plan.changed) {
    return;
  }
  if (!isContentEditable) {
    throw new ContentSeedError(
      isGraphShapeChange(plan)
        ? "CONTENT_GRAPH_MISMATCH"
        : "PUBLISHED_CONTENT_MISMATCH",
      `${describeTarget} no longer match the content constants, and this program_version is not ` +
        "content-editable. Publish a new program_version, or move this one to a living " +
        "(content_lock='mutable') state, instead of editing published content in place.",
    );
  }
  if (plan.toArchive.length > 0 && !allowArchive) {
    throw new ContentSeedError(
      "DESTRUCTIVE_CONTENT_CHANGE_NOT_ALLOWED",
      `This seed run would archive ${plan.toArchive.length} row(s) under ${describeTarget} ` +
        `(${plan.toArchive.map((row) => row.key).join(", ")}). Pass --allow-archive ` +
        "(or set ALLOW_DESTRUCTIVE_CONTENT_CHANGE=1) to confirm this is intentional.",
    );
  }
}

// `isContentEditable` reflects the program_version's own editability
// (draft, or published+mutable — see db/program.ts's
// isProgramVersionContentEditable) — module_definitions/module_questions/
// artifact_definitions have no lifecycle field of their own beyond
// active/archived(/draft for modules), so their immutability once
// non-editable is enforced here rather than by a DB trigger.
async function reconcileModuleDefinitionContent(
  client: PoolClient,
  programVersionId: string,
  isContentEditable: boolean,
  module: ModuleContent,
): Promise<string> {
  const existing = await client.query<
    { id: string; status: string } & Record<
      (typeof MODULE_FIELDS)[number],
      unknown
    >
  >(
    `select id, status, ${MODULE_FIELDS.join(", ")}
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

  // isPublishable isn't a stored column (it only steers publish.ts's
  // activation pass), so this can't be derived from `differing` below —
  // it must be checked independently, and before the early-return, on
  // every reconcile, not just ones where some other field also changed.
  if (row.status === "active" && !module.isPublishable) {
    throw new ContentSeedError(
      "MODULE_DEMOTION_UNSUPPORTED",
      `module_definitions "${module.moduleKey}" is currently active but the content constants now mark ` +
        "it isPublishable:false. Demoting an active module to a draft placeholder is not supported — " +
        "remove it from the content constants instead, which archives it (and its Questions/Artifacts) " +
        "without disturbing any Run's existing program_run_modules rows.",
    );
  }

  const differing = diffFields(expected, row, MODULE_FIELDS);
  if (differing.length === 0) {
    return row.id;
  }

  if (!isContentEditable) {
    throw new ContentSeedError(
      "PUBLISHED_CONTENT_MISMATCH",
      `module_definitions "${module.moduleKey}" no longer matches the content constants ` +
        `(fields: ${differing.join(", ")}), and its program_version is not content-editable. ` +
        "Publish a new program_version instead of editing published content.",
    );
  }

  await client.query(
    `update module_definitions
     set title = $1, subtitle = $2, description = $3, objective = $4,
         module_type = $5, is_required = $6, allow_revisions = $7, completion_mode = $8,
         estimated_minutes = $9
     where id = $10`,
    [
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
  isContentEditable: boolean,
  allowArchive: boolean,
  questions: QuestionContent[],
): Promise<void> {
  const current = await loadExistingOrderedRows(
    client,
    "module_questions",
    "question_key",
    "module_definition_id",
    moduleDefinitionId,
  );
  const plan = planOrderedRows(
    current,
    questions.map((question) => ({
      key: question.questionKey,
      sequenceIndex: question.sequenceIndex,
    })),
  );
  assertPlanAllowed(
    plan,
    isContentEditable,
    allowArchive,
    `module_questions for module_definition ${moduleDefinitionId}`,
  );
  await applyOrderedRowsPlan(client, "module_questions", plan, "active");

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

    if (!isContentEditable) {
      throw new ContentSeedError(
        "PUBLISHED_CONTENT_MISMATCH",
        `module_questions "${question.questionKey}" no longer matches the content constants ` +
          `(fields: ${differing.join(", ")}), and its program_version is not content-editable.`,
      );
    }

    await client.query(
      `update module_questions
       set question_group = $1, question_text = $2, help_text = $3,
           placeholder_text = $4, response_type = $5, is_required = $6, allow_skip = $7,
           options = $8, conditions = $9
       where id = $10`,
      [
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
  isContentEditable: boolean,
  allowArchive: boolean,
  artifacts: ArtifactContent[],
): Promise<void> {
  const current = await loadExistingOrderedRows(
    client,
    "artifact_definitions",
    "artifact_key",
    "module_definition_id",
    moduleDefinitionId,
  );
  const plan = planOrderedRows(
    current,
    artifacts.map((artifact) => ({
      key: artifact.artifactKey,
      sequenceIndex: artifact.sequenceIndex,
    })),
  );
  assertPlanAllowed(
    plan,
    isContentEditable,
    allowArchive,
    `artifact_definitions for module_definition ${moduleDefinitionId}`,
  );
  await applyOrderedRowsPlan(client, "artifact_definitions", plan, "active");

  for (const artifact of artifacts) {
    try {
      validateConfigForValidator(
        artifact.validatorKey,
        artifact.validationConfig,
      );
    } catch (error) {
      throw new ContentSeedError(
        "INVALID_VALIDATION_CONFIG",
        `artifact_definitions "${artifact.artifactKey}" has a validationConfig that does not match ` +
          `the schema for validator_key "${artifact.validatorKey ?? "null"}": ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }

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
    // as a string rather than a number — normalize before comparing.
    if (row && typeof row.max_file_size_bytes === "string") {
      row.max_file_size_bytes = Number(row.max_file_size_bytes);
    }

    if (!row) {
      await client.query(
        `insert into artifact_definitions
           (module_definition_id, artifact_key, sequence_index, name, description, is_required,
            artifact_type, source_format, output_format, required_filename, renderer_key,
            validator_key, allowed_mime_types, max_file_size_bytes, max_files, validation_config,
            output_config, status)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'active')`,
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

    if (!isContentEditable) {
      throw new ContentSeedError(
        "PUBLISHED_CONTENT_MISMATCH",
        `artifact_definitions "${artifact.artifactKey}" no longer matches the content constants ` +
          `(fields: ${differing.join(", ")}), and its program_version is not content-editable.`,
      );
    }

    await client.query(
      `update artifact_definitions
       set name = $1, description = $2, is_required = $3, artifact_type = $4,
           source_format = $5, output_format = $6, required_filename = $7, renderer_key = $8,
           validator_key = $9, allowed_mime_types = $10, max_file_size_bytes = $11,
           max_files = $12, validation_config = $13, output_config = $14
       where id = $15`,
      [
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

// --- Cascade archive ---
// Archiving a Module must cascade — child rows stay reachable by direct lookup
// (loadArtifactDefinitionByKey ignores parent status). Bindings hard-deleted;
// Questions/Artifacts archived (artifact_submissions FK).
async function cascadeArchiveModules(
  client: PoolClient,
  archivedModuleIds: string[],
): Promise<void> {
  if (archivedModuleIds.length === 0) {
    return;
  }
  await client.query(
    `update module_questions set status = 'archived'
     where module_definition_id = any($1::uuid[]) and status <> 'archived'`,
    [archivedModuleIds],
  );
  await client.query(
    `update artifact_definitions set status = 'archived'
     where module_definition_id = any($1::uuid[]) and status <> 'archived'`,
    [archivedModuleIds],
  );
  await client.query(
    `delete from module_prompt_bindings where module_definition_id = any($1::uuid[])`,
    [archivedModuleIds],
  );
}

/**
 * Reconcile Modules plus nested Questions/Artifacts. Removed keys archive (with cascade)
 * when content-editable and allowArchive; otherwise graph/sequence changes are hard errors.
 */
export async function reconcileModules(
  client: PoolClient,
  programVersionId: string,
  isContentEditable: boolean,
  allowArchive: boolean,
  modules: ModuleContent[],
): Promise<ReconciledModule[]> {
  const current = await loadExistingOrderedRows(
    client,
    "module_definitions",
    "module_key",
    "program_version_id",
    programVersionId,
  );
  const plan = planOrderedRows(
    current,
    modules.map((module) => ({
      key: module.moduleKey,
      sequenceIndex: module.sequenceIndex,
    })),
  );
  assertPlanAllowed(
    plan,
    isContentEditable,
    allowArchive,
    `module_definitions under program_version ${programVersionId}`,
  );
  await applyOrderedRowsPlan(client, "module_definitions", plan, "draft");
  await cascadeArchiveModules(
    client,
    plan.toArchive.map((row) => row.id),
  );

  const results: ReconciledModule[] = [];
  for (const module of modules) {
    const moduleId = await reconcileModuleDefinitionContent(
      client,
      programVersionId,
      isContentEditable,
      module,
    );
    await reconcileModuleQuestions(
      client,
      moduleId,
      isContentEditable,
      allowArchive,
      module.questions,
    );
    await reconcileArtifactDefinitions(
      client,
      moduleId,
      isContentEditable,
      allowArchive,
      module.artifacts,
    );
    results.push({
      moduleId,
      moduleKey: module.moduleKey,
      isPublishable: module.isPublishable,
    });
  }
  return results;
}
