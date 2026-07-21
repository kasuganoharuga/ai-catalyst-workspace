import type { PoolClient } from "pg";

import { diffFields, diffKeySets } from "../compare.js";
import { ContentSeedError } from "../errors.js";
import type { ModulePromptBindingContent, PromptContent } from "../types.js";
import type { ReconciledModule } from "./modules.js";

export interface ReconciledPromptVersion {
  promptKey: string;
  promptVersionId: string;
  status: "draft" | "published" | "retired";
}

const DEFINITION_METADATA_FIELDS = ["name", "description"] as const;
const VERSION_FIELDS = ["content", "content_format", "variable_config"] as const;

// prompt_definitions has no draft/published lifecycle of its own — its
// status is only active/archived. Catalog metadata (name/description) may
// be corrected in place so deploys can republish prompt copy without a
// manual staging UPDATE. prompt_type is structural identity and still
// rejected on mismatch; published prompt_versions.content stays immutable.
async function reconcilePromptDefinition(
  client: PoolClient,
  prompt: PromptContent,
): Promise<string> {
  const existing = await client.query<{
    id: string;
    name: string;
    description: string | null;
    prompt_type: string;
  }>(
    `select id, name, description, prompt_type
     from prompt_definitions
     where prompt_key = $1`,
    [prompt.promptKey],
  );

  const expected = {
    name: prompt.name,
    description: prompt.description,
    prompt_type: prompt.promptType,
  };

  const row = existing.rows[0];
  if (!row) {
    const inserted = await client.query<{ id: string }>(
      `insert into prompt_definitions (prompt_key, name, description, prompt_type)
       values ($1, $2, $3, $4)
       returning id`,
      [prompt.promptKey, expected.name, expected.description, expected.prompt_type],
    );
    return inserted.rows[0].id;
  }

  if (row.prompt_type !== expected.prompt_type) {
    throw new ContentSeedError(
      "PUBLISHED_CONTENT_MISMATCH",
      `prompt_definitions "${prompt.promptKey}" already exists with a different prompt_type ` +
        "than the content constants. prompt_type is not editable by this script.",
    );
  }

  const differing = diffFields(expected, row, DEFINITION_METADATA_FIELDS);
  if (differing.length === 0) {
    return row.id;
  }

  await client.query(
    `update prompt_definitions
     set name = $1, description = $2
     where id = $3`,
    [expected.name, expected.description, row.id],
  );
  return row.id;
}

// prompt_versions has its own draft -> published -> retired lifecycle
// (enforced additionally by a `prompt_versions_freeze` DB trigger),
// independent of the parent program_version's status.
async function reconcilePromptVersion(
  client: PoolClient,
  promptDefinitionId: string,
  prompt: PromptContent,
): Promise<ReconciledPromptVersion> {
  const existing = await client.query<
    { id: string; status: "draft" | "published" | "retired" } & Record<
      (typeof VERSION_FIELDS)[number],
      unknown
    >
  >(
    `select id, status, ${VERSION_FIELDS.join(", ")}
     from prompt_versions
     where prompt_definition_id = $1 and version_number = $2`,
    [promptDefinitionId, prompt.versionNumber],
  );

  const expected = {
    content: prompt.content,
    content_format: prompt.contentFormat,
    variable_config: prompt.variableConfig,
  };

  const row = existing.rows[0];
  if (!row) {
    const inserted = await client.query<{ id: string; status: "draft" | "published" | "retired" }>(
      `insert into prompt_versions (prompt_definition_id, version_number, content, content_format, variable_config)
       values ($1, $2, $3, $4, $5)
       returning id, status`,
      [
        promptDefinitionId,
        prompt.versionNumber,
        expected.content,
        expected.content_format,
        JSON.stringify(expected.variable_config),
      ],
    );
    return {
      promptKey: prompt.promptKey,
      promptVersionId: inserted.rows[0].id,
      status: inserted.rows[0].status,
    };
  }

  if (row.status === "retired") {
    throw new ContentSeedError(
      "CONTENT_ALREADY_RETIRED",
      `prompt_versions for "${prompt.promptKey}" v${prompt.versionNumber} is retired and can no longer be the target of this seed script.`,
    );
  }

  const differing = diffFields(expected, row, VERSION_FIELDS);
  if (differing.length === 0) {
    return { promptKey: prompt.promptKey, promptVersionId: row.id, status: row.status };
  }

  if (row.status === "published") {
    throw new ContentSeedError(
      "PUBLISHED_CONTENT_MISMATCH",
      `prompt_versions for "${prompt.promptKey}" v${prompt.versionNumber} is already published and its ` +
        `${differing.join("/")} no longer matches the content constants. Create a new version instead.`,
    );
  }

  const updated = await client.query<{ id: string; status: "draft" | "published" | "retired" }>(
    `update prompt_versions
     set content = $1, content_format = $2, variable_config = $3
     where id = $4
     returning id, status`,
    [expected.content, expected.content_format, JSON.stringify(expected.variable_config), row.id],
  );
  return {
    promptKey: prompt.promptKey,
    promptVersionId: updated.rows[0].id,
    status: updated.rows[0].status,
  };
}

/**
 * Reconciles every prompt_definitions/prompt_versions pair in `prompts`.
 * Does not touch program_prompt_bindings — Prompts are bound at the Module
 * level only, via reconcileModulePromptBindings.
 */
export async function reconcilePrompts(
  client: PoolClient,
  prompts: PromptContent[],
): Promise<ReconciledPromptVersion[]> {
  const results: ReconciledPromptVersion[] = [];
  for (const prompt of prompts) {
    const promptDefinitionId = await reconcilePromptDefinition(client, prompt);
    results.push(await reconcilePromptVersion(client, promptDefinitionId, prompt));
  }
  return results;
}

/**
 * Reconciles module_prompt_bindings for every Module that has expected
 * bindings. Performs its own graph completeness check per Module (extra
 * bindings not present in the content constants are rejected), mirroring
 * reconcileModules' question/artifact checks.
 */
export async function reconcileModulePromptBindings(
  client: PoolClient,
  isDraftEditable: boolean,
  modules: ReconciledModule[],
  promptVersions: ReconciledPromptVersion[],
  bindings: ModulePromptBindingContent[],
): Promise<void> {
  const moduleIdByKey = new Map(modules.map((module) => [module.moduleKey, module.moduleId]));
  const promptVersionIdByKey = new Map(
    promptVersions.map((version) => [version.promptKey, version.promptVersionId]),
  );

  const bindingsByModuleKey = new Map<string, ModulePromptBindingContent[]>();
  for (const binding of bindings) {
    const list = bindingsByModuleKey.get(binding.moduleKey) ?? [];
    list.push(binding);
    bindingsByModuleKey.set(binding.moduleKey, list);
  }

  for (const module of modules) {
    const moduleId = moduleIdByKey.get(module.moduleKey);
    if (!moduleId) {
      // Cannot happen: `modules` is the reconciler's own return value.
      throw new Error(`Internal error: module "${module.moduleKey}" was not reconciled.`);
    }

    const expectedBindings = bindingsByModuleKey.get(module.moduleKey) ?? [];

    const actual = await client.query<{ purpose: string; sequence_index: number }>(
      `select purpose, sequence_index from module_prompt_bindings where module_definition_id = $1`,
      [moduleId],
    );

    const expectedKeys = expectedBindings.map(
      (binding) => `${binding.purpose}:${binding.sequenceIndex}`,
    );
    const actualKeys = actual.rows.map((row) => `${row.purpose}:${row.sequence_index}`);
    const { extra } = diffKeySets(expectedKeys, actualKeys);
    if (extra.length > 0) {
      throw new ContentSeedError(
        "CONTENT_GRAPH_MISMATCH",
        `module_prompt_bindings for "${module.moduleKey}" has unexpected rows not present in the content constants: ${extra.join(", ")}.`,
      );
    }

    for (const binding of expectedBindings) {
      const promptVersionId = promptVersionIdByKey.get(binding.promptKey);
      if (!promptVersionId) {
        throw new Error(
          `Internal error: prompt "${binding.promptKey}" was not reconciled before its binding.`,
        );
      }

      const existing = await client.query<{ id: string; prompt_version_id: string; is_required: boolean }>(
        `select id, prompt_version_id, is_required
         from module_prompt_bindings
         where module_definition_id = $1 and purpose = $2 and sequence_index = $3`,
        [moduleId, binding.purpose, binding.sequenceIndex],
      );

      const row = existing.rows[0];
      if (!row) {
        await client.query(
          `insert into module_prompt_bindings (module_definition_id, prompt_version_id, purpose, sequence_index, is_required)
           values ($1, $2, $3, $4, $5)`,
          [moduleId, promptVersionId, binding.purpose, binding.sequenceIndex, binding.isRequired],
        );
        continue;
      }

      const differing = diffFields(
        { prompt_version_id: promptVersionId, is_required: binding.isRequired },
        { prompt_version_id: row.prompt_version_id, is_required: row.is_required },
        ["prompt_version_id", "is_required"],
      );

      if (differing.length === 0) {
        continue;
      }

      // module_prompt_bindings has no lifecycle field of its own — like
      // module_definitions/module_questions/artifact_definitions, its
      // immutability once published is enforced here, not by a DB trigger.
      if (!isDraftEditable) {
        throw new ContentSeedError(
          "PUBLISHED_CONTENT_MISMATCH",
          `module_prompt_bindings for "${module.moduleKey}" purpose="${binding.purpose}" ` +
            `sequence_index=${binding.sequenceIndex} no longer matches the content constants ` +
            `(fields: ${differing.join(", ")}), and its program_version is no longer draft.`,
        );
      }

      await client.query(
        `update module_prompt_bindings
         set prompt_version_id = $1, is_required = $2
         where id = $3`,
        [promptVersionId, binding.isRequired, row.id],
      );
    }
  }
}
