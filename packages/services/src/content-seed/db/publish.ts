import type { PoolClient } from "pg";

import { ContentSeedError } from "../errors.js";
import type { ReconciledModule } from "./modules.js";
import type { ReconciledPromptVersion } from "./prompts.js";

export interface PublishParams {
  programVersionId: string;
  modules: ReconciledModule[];
  promptVersions: ReconciledPromptVersion[];
  expectedModulePromptBindingCounts: Map<string, number>;
}

function fail(message: string): never {
  throw new ContentSeedError("PUBLISH_PRECONDITION_FAILED", message);
}

/**
 * Publishes this Program Version's content in a fixed 9-step order:
 * Prompt Versions publish first, then publishable Modules activate, and
 * the Program Version publishes last — so a failure partway through never
 * leaves the Program Version marked published while its content is still
 * draft. Every step re-verifies its own precondition rather than trusting
 * the caller, since this function is the last line of defence against a
 * partially-reconciled run reaching "published".
 *
 * Only called when the Program Version was fetched as `draft` at the start
 * of the run; an already-published Program Version's content is verified
 * to match exactly before this function would ever be reached.
 */
export async function publishProgramVersion(
  client: PoolClient,
  params: PublishParams,
): Promise<void> {
  const { programVersionId, modules, promptVersions, expectedModulePromptBindingCounts } = params;

  // Step 1 — Program Version must currently be draft.
  const programVersion = await client.query<{ status: string }>(
    `select status from program_versions where id = $1 for update`,
    [programVersionId],
  );
  if (programVersion.rows[0]?.status !== "draft") {
    fail(
      `program_version ${programVersionId} is not draft (status=${programVersion.rows[0]?.status ?? "missing"}); cannot publish.`,
    );
  }

  const publishableModules = modules.filter((module) => module.isPublishable);
  const placeholderModules = modules.filter((module) => !module.isPublishable);

  // Step 2 — every publishable Module's content must be complete: it must
  // have at least one child row (Questions and/or Artifact Definitions) —
  // an empty shell is not publishable content.
  for (const module of publishableModules) {
    const counts = await client.query<{ question_count: string; artifact_count: string }>(
      `select
         (select count(*) from module_questions where module_definition_id = $1) as question_count,
         (select count(*) from artifact_definitions where module_definition_id = $1) as artifact_count`,
      [module.moduleId],
    );
    const row = counts.rows[0];
    const totalChildren = Number(row?.question_count ?? 0) + Number(row?.artifact_count ?? 0);
    if (totalChildren === 0) {
      fail(
        `Module "${module.moduleKey}" is marked publishable but has no module_questions or artifact_definitions rows.`,
      );
    }
  }

  // Step 3 — placeholder Modules must all still be draft.
  if (placeholderModules.length > 0) {
    const statuses = await client.query<{ id: string; status: string }>(
      `select id, status from module_definitions where id = any($1::uuid[])`,
      [placeholderModules.map((module) => module.moduleId)],
    );
    const nonDraft = statuses.rows.filter((row) => row.status !== "draft");
    if (nonDraft.length > 0) {
      fail(
        `Expected all placeholder modules to be draft, found non-draft: ${nonDraft.map((row) => row.id).join(", ")}.`,
      );
    }
  }

  // Step 4 — required Prompt Definitions/Versions must exist for every
  // Module that expects bindings.
  for (const [moduleKey, expectedCount] of expectedModulePromptBindingCounts) {
    const module = modules.find((candidate) => candidate.moduleKey === moduleKey);
    if (!module) {
      fail(`Module "${moduleKey}" has expected prompt bindings but was not reconciled.`);
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

  // Step 5 — every Prompt Version this run reconciled must be in a
  // publishable state. Prompt content is shared/global (keyed by
  // prompt_key, not scoped to a Program Version), so an already-published
  // Prompt Version being reused unchanged by this Program Version is
  // expected, not an error; reconcilePrompts already rejected `retired`
  // versions and content drift against `published` ones before returning,
  // so any status reaching here is safe to proceed with.
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

  // Step 6 — already verified by Step 4's exact-count check above; kept as
  // a distinct, named step to match the documented 9-step order.

  // Step 7 — publish every Prompt Version that is still draft (one already
  // published by an earlier Program Version's publish is left untouched).
  const draftPromptVersions = promptVersions.filter((version) => version.status === "draft");
  if (draftPromptVersions.length > 0) {
    const publishedPromptVersions = await client.query<{ id: string }>(
      `update prompt_versions
       set status = 'published', published_at = now()
       where id = any($1::uuid[]) and status = 'draft'
       returning id`,
      [draftPromptVersions.map((version) => version.promptVersionId)],
    );
    if (publishedPromptVersions.rowCount !== draftPromptVersions.length) {
      fail(
        `Expected to publish ${draftPromptVersions.length} prompt_versions, updated ${publishedPromptVersions.rowCount}.`,
      );
    }
  }

  // Step 8 — activate the publishable Modules.
  if (publishableModules.length > 0) {
    const activatedModules = await client.query<{ id: string }>(
      `update module_definitions
       set status = 'active'
       where id = any($1::uuid[]) and status = 'draft'
       returning id`,
      [publishableModules.map((module) => module.moduleId)],
    );
    if (activatedModules.rowCount !== publishableModules.length) {
      fail(
        `Expected to activate ${publishableModules.length} module_definitions, updated ${activatedModules.rowCount}.`,
      );
    }
  }

  // Step 9 — publish the Program Version last.
  const publishedProgramVersion = await client.query<{ id: string }>(
    `update program_versions
     set status = 'published', published_at = now()
     where id = $1 and status = 'draft'
     returning id`,
    [programVersionId],
  );
  if (publishedProgramVersion.rowCount !== 1) {
    fail(`Expected to publish program_version ${programVersionId}, updated ${publishedProgramVersion.rowCount} rows.`);
  }
}
