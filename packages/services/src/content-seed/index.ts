import type { PoolClient } from "pg";

import { DEFAULT_TOOLKIT_CONTENT } from "./content/index.js";
import { publishProgramVersion } from "./db/publish.js";
import { reconcileModules } from "./db/modules.js";
import { reconcileModulePromptBindings, reconcilePrompts } from "./db/prompts.js";
import { reconcileProgram } from "./db/program.js";
import type { ToolkitSeedContent } from "./types.js";

// Fixed advisory lock key — any distinct bigint works as long as it never
// collides with another advisory lock user of this database. Picked
// arbitrarily; must never change once in use.
const SEED_LOCK_KEY = 727_310_101;

export interface SeedResult {
  programId: string;
  programVersionId: string;
  programVersionStatus: "draft" | "published" | "retired";
  modulesReconciled: number;
  promptsReconciled: number;
  published: boolean;
}

/**
 * Idempotently reconciles `content` (defaults to the reviewed canonical
 * content) into the database and publishes it if the target Program
 * Version was still draft when this run started.
 *
 * Callers must open the transaction themselves before calling this and
 * commit/rollback it afterwards — this function issues no begin/commit/
 * rollback of its own, both so the advisory lock below actually spans the
 * whole reconcile+publish sequence (pg_advisory_xact_lock is a no-op
 * outside an explicit transaction block) and so tests can call it
 * directly against a client whose transaction they control.
 */
export async function seedToolkitContent(
  client: PoolClient,
  content: ToolkitSeedContent = DEFAULT_TOOLKIT_CONTENT,
): Promise<SeedResult> {
  // Transaction-scoped advisory lock: released automatically on commit or
  // rollback, so two concurrent seed runs never interleave their inserts
  // and race a unique-constraint violation instead of one simply waiting
  // for the other.
  await client.query("select pg_advisory_xact_lock($1)", [SEED_LOCK_KEY]);

  const program = await reconcileProgram(client, content.program);
  const isDraftEditable = program.programVersionStatus === "draft";

  const modules = await reconcileModules(
    client,
    program.programVersionId,
    isDraftEditable,
    content.modules,
  );

  const promptVersions = await reconcilePrompts(client, content.prompts);

  await reconcileModulePromptBindings(
    client,
    isDraftEditable,
    modules,
    promptVersions,
    content.promptBindings,
  );

  let published = false;
  if (isDraftEditable) {
    const expectedModulePromptBindingCounts = new Map<string, number>();
    for (const binding of content.promptBindings) {
      expectedModulePromptBindingCounts.set(
        binding.moduleKey,
        (expectedModulePromptBindingCounts.get(binding.moduleKey) ?? 0) + 1,
      );
    }

    await publishProgramVersion(client, {
      programVersionId: program.programVersionId,
      modules,
      promptVersions,
      expectedModulePromptBindingCounts,
    });
    published = true;
  }

  return {
    programId: program.programId,
    programVersionId: program.programVersionId,
    programVersionStatus: published ? "published" : program.programVersionStatus,
    modulesReconciled: modules.length,
    promptsReconciled: promptVersions.length,
    published,
  };
}

export { DEFAULT_TOOLKIT_CONTENT } from "./content/index.js";
export { ContentSeedError } from "./errors.js";
export type { ContentSeedErrorCode } from "./errors.js";
export type { ToolkitSeedContent } from "./types.js";
