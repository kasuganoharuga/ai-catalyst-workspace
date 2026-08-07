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
 * Idempotent activation pass: everything that used to be publishProgramVersion's
 * Steps 2-5/7/8, restructured so running it again on unchanged content is a
 * true no-op (zero UPDATEs) rather than re-asserting an exact rowCount that
 * would only ever be true the very first time. This is what makes it safe
 * to call on EVERY `pnpm db:seed`, not just the first one that flips a
 * program_version from draft to published — without this, a Module or
 * Prompt Version added to an already-published, content_lock='mutable'
 * ("living") program_version would sit at status='draft' forever, since
 * nothing else in the reconciler ever activates it.
 *
 * Steps 1 (program_version must be draft) and 9 (mark it published) are
 * NOT here — those only make sense the one time a program_version moves
 * out of draft; see markProgramVersionPublished below, called only then.
 */
export async function activateReconciledContent(
  client: PoolClient,
  params: ActivationParams,
): Promise<ActivationResult> {
  const { modules, promptVersions, expectedModulePromptBindingCounts } = params;

  const publishableModules = modules.filter((module) => module.isPublishable);
  const placeholderModules = modules.filter((module) => !module.isPublishable);

  // Step 2 — every publishable Module's content must be complete: at
  // least one active Question and/or Artifact Definition. Filtered to
  // status='active' so an archived child doesn't count toward this, and
  // archiving every child of a still-publishable Module correctly fails
  // here instead of silently leaving an empty shell active.
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

  // Step 3 — placeholder Modules must never be active. Unlike the
  // original one-shot version of this check ("must still be draft"),
  // 'archived' is also acceptable here — a placeholder that was archived
  // and later revived comes back as 'draft' (see
  // reconcile-ordered-rows.ts's applyOrderedRowsPlan revive-status for
  // module_definitions), which still satisfies this.
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

  // Step 4 — required Prompt Definitions/Versions must exist for every
  // Module that expects bindings.
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

  // Step 5 — every reconciled Prompt Version must be in a publishable
  // state. Prompt content is shared/global (keyed by prompt_key, not
  // scoped to a Program Version), so an already-published Prompt Version
  // being reused unchanged is expected, not an error; reconcilePrompts
  // already rejected `retired` versions and content drift against
  // `published` ones before returning, so any status reaching here is
  // safe to proceed with.
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

  // Step 7 — publish every Prompt Version that is still draft (one
  // already published by an earlier seed run, possibly under a different
  // program_version, is left untouched). Idempotent: the follow-up SELECT
  // asserts none of the *targeted* ids are left un-published, rather than
  // asserting the UPDATE's rowCount equals the target count — the latter
  // would only ever hold true the first time this runs.
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

  // Step 8 — activate every publishable Module that isn't already active
  // (covers both a brand new draft row and a previously-active-then-
  // archived-then-revived one, which reconcile-ordered-rows.ts's
  // applyOrderedRowsPlan always revives to 'draft' specifically so it
  // lands back here). Idempotent for the same reason as Step 7 above.
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
 * The one-time transition of a program_version out of draft — Steps 1
 * (must currently be draft) and 9 (mark it published) of the original
 * publish sequence, combined into a single function called only when
 * `seedToolkitContent` observes `programVersionStatus === "draft"` at the
 * start of the run. Must run AFTER activateReconciledContent, so a
 * failure partway through activation never leaves the program_version
 * marked published while its content is still incomplete. Safe to run
 * after activation rather than locking the row first, because the whole
 * transaction already holds seedToolkitContent's exclusive
 * pg_advisory_xact_lock — nothing else can be racing this program_version
 * to `published` in between.
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
