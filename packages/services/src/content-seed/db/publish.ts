import type { PoolClient } from "pg";

import { ContentSeedError } from "../errors.js";
import type { ReconciledModule } from "./modules.js";
import type { ReconciledPromptVersion } from "./prompts.js";

export interface ActivationParams {
  modules: ReconciledModule[];
  promptVersions: ReconciledPromptVersion[];
  expectedModulePromptBindingCounts: Map<string, number>;
}

export interface ActivationResult {
  promptVersionsPublished: number;
  modulesActivated: number;
}

function fail(message: string): never {
  throw new ContentSeedError("PUBLISH_PRECONDITION_FAILED", message);
}

/**
 * Idempotent activation (old publish steps 2–5/7/8) — safe on every db:seed, not just first publish.
 * Steps 1 and 9 (draft gate + mark published) live in markProgramVersionPublished.
 */
export async function activateReconciledContent(
  client: PoolClient,
  params: ActivationParams,
): Promise<ActivationResult> {
  const { modules, promptVersions, expectedModulePromptBindingCounts } = params;

  const publishableModules = modules.filter((module) => module.isPublishable);
  const placeholderModules = modules.filter((module) => !module.isPublishable);

  // Publishable modules need at least one active question or artifact child.
  for (const module of publishableModules) {
    const counts = await client.query<{
      question_count: string;
      artifact_count: string;
    }>(
      `select
         (select count(*) from module_questions where module_definition_id = $1 and status = 'active') as question_count,
         (select count(*) from artifact_definitions where module_definition_id = $1 and status = 'active') as artifact_count`,
      [module.moduleId],
    );
    const row = counts.rows[0];
    const totalChildren =
      Number(row?.question_count ?? 0) + Number(row?.artifact_count ?? 0);
    if (totalChildren === 0) {
      fail(
        `Module "${module.moduleKey}" is marked publishable but has no active module_questions or artifact_definitions rows.`,
      );
    }
  }

  // Placeholder modules must never be active ('draft' or 'archived' is fine).
  if (placeholderModules.length > 0) {
    const statuses = await client.query<{
      id: string;
      status: string;
      module_key: string;
    }>(
      `select id, module_key, status from module_definitions where id = any($1::uuid[])`,
      [placeholderModules.map((module) => module.moduleId)],
    );
    const active = statuses.rows.filter((row) => row.status === "active");
    if (active.length > 0) {
      fail(
        `Expected placeholder modules to never be active, found active: ${active.map((row) => row.module_key).join(", ")}.`,
      );
    }
  }

  // Every module with expected bindings must have that many rows.
  for (const [moduleKey, expectedCount] of expectedModulePromptBindingCounts) {
    const module = modules.find(
      (candidate) => candidate.moduleKey === moduleKey,
    );
    if (!module) {
      fail(
        `Module "${moduleKey}" has expected prompt bindings but was not reconciled.`,
      );
    }
    const bindingCount = await client.query<{ count: string }>(
      `select count(*) as count from module_prompt_bindings where module_definition_id = $1`,
      [module!.moduleId],
    );
    if (Number(bindingCount.rows[0]?.count ?? 0) !== expectedCount) {
      fail(
        `Module "${moduleKey}" expected ${expectedCount} module_prompt_bindings, found ${bindingCount.rows[0]?.count ?? 0}.`,
      );
    }
  }

  // Reconciled prompt versions must be draft or published (retired already rejected upstream).
  const unpublishablePromptVersions = promptVersions.filter(
    (version) => version.status !== "draft" && version.status !== "published",
  );
  if (unpublishablePromptVersions.length > 0) {
    fail(
      `Expected every reconciled prompt_versions to be draft or published, found: ${unpublishablePromptVersions
        .map((version) => `${version.promptKey} (${version.status})`)
        .join(", ")}.`,
    );
  }

  // Publish draft prompt versions; already-published rows are left untouched.
  const draftPromptVersionIds = promptVersions
    .filter((version) => version.status === "draft")
    .map((version) => version.promptVersionId);
  let promptVersionsPublished = 0;
  if (draftPromptVersionIds.length > 0) {
    const updated = await client.query<{ id: string }>(
      `update prompt_versions
       set status = 'published', published_at = now()
       where id = any($1::uuid[]) and status = 'draft'
       returning id`,
      [draftPromptVersionIds],
    );
    promptVersionsPublished = updated.rowCount ?? 0;

    const stillUnpublished = await client.query<{ id: string }>(
      `select id from prompt_versions where id = any($1::uuid[]) and status <> 'published'`,
      [draftPromptVersionIds],
    );
    if ((stillUnpublished.rowCount ?? 0) > 0) {
      fail(
        `Expected to publish ${draftPromptVersionIds.length} prompt_versions, ` +
          `${stillUnpublished.rowCount} remain unpublished.`,
      );
    }
  }

  // Activate publishable modules not yet active (including revived-as-draft rows).
  const publishableModuleIds = publishableModules.map(
    (module) => module.moduleId,
  );
  let modulesActivated = 0;
  if (publishableModuleIds.length > 0) {
    const activated = await client.query<{ id: string }>(
      `update module_definitions
       set status = 'active'
       where id = any($1::uuid[]) and status <> 'active'
       returning id`,
      [publishableModuleIds],
    );
    modulesActivated = activated.rowCount ?? 0;

    const stillNotActive = await client.query<{ module_key: string }>(
      `select module_key from module_definitions where id = any($1::uuid[]) and status <> 'active'`,
      [publishableModuleIds],
    );
    if ((stillNotActive.rowCount ?? 0) > 0) {
      fail(
        `Expected to activate ${publishableModuleIds.length} module_definitions, found still not active: ` +
          `${stillNotActive.rows.map((row) => row.module_key).join(", ")}.`,
      );
    }
  }

  return { promptVersionsPublished, modulesActivated };
}

/**
 * One-time draft → published transition for program_version — runs after activateReconciledContent
 * on first seed only, under the same SEED_LOCK transaction.
 */
export async function markProgramVersionPublished(
  client: PoolClient,
  programVersionId: string,
): Promise<void> {
  const programVersion = await client.query<{ status: string }>(
    `select status from program_versions where id = $1 for update`,
    [programVersionId],
  );
  if (programVersion.rows[0]?.status !== "draft") {
    fail(
      `program_version ${programVersionId} is not draft (status=${programVersion.rows[0]?.status ?? "missing"}); cannot publish.`,
    );
  }

  const published = await client.query<{ id: string }>(
    `update program_versions
     set status = 'published', published_at = now()
     where id = $1 and status = 'draft'
     returning id`,
    [programVersionId],
  );
  if (published.rowCount !== 1) {
    fail(
      `Expected to publish program_version ${programVersionId}, updated ${published.rowCount} rows.`,
    );
  }
}
