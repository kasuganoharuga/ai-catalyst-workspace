import type { PoolClient } from "pg";

import { DEFAULT_TOOLKIT_CONTENT } from "./content/index.js";
import {
  activateReconciledContent,
  markProgramVersionPublished,
} from "./db/publish.js";
import { reconcileModules } from "./db/modules.js";
import {
  reconcileModulePromptBindings,
  reconcilePrompts,
} from "./db/prompts.js";
import { reconcileProgram } from "./db/program.js";
import type { ToolkitSeedContent } from "./types.js";

// Fixed advisory lock key — must never change once in use.
const SEED_LOCK_KEY = 727_310_101;

export interface SeedOptions {
  /**
   * Allow archive/hard-delete during reconcile. Off by default so accidental
   * content drops fail loudly instead of archiving on deploy.
   */
  allowArchive?: boolean;
}

export interface SeedResult {
  programId: string;
  programVersionId: string;
  programVersionStatus: "draft" | "published" | "retired";
  contentLock: "mutable" | "frozen";
  modulesReconciled: number;
  promptsReconciled: number;
  published: boolean;
  /** Non-zero when a living re-seed activates newly added modules or prompt versions. */
  promptVersionsActivated: number;
  modulesActivated: number;
}

/**
 * Idempotently reconciles content into the DB. First draft run also publishes;
 * living mutable runs re-reconcile and re-activate in place.
 * Caller owns the transaction — this function uses pg_advisory_xact_lock only.
 */
export async function seedToolkitContent(
  client: PoolClient,
  content: ToolkitSeedContent = DEFAULT_TOOLKIT_CONTENT,
  options: SeedOptions = {},
): Promise<SeedResult> {
  const allowArchive = options.allowArchive ?? false;

  // Exclusive lock for the whole reconcile+activate sequence; shared by reconcile-run-modules readers.
  await client.query("select pg_advisory_xact_lock($1)", [SEED_LOCK_KEY]);

  const program = await reconcileProgram(client, content.program);
  // Editable before first publish or while content_lock stays mutable ("living V1").
  const isFirstPublish = program.programVersionStatus === "draft";
  const isContentEditable = isFirstPublish || program.contentLock === "mutable";

  const modules = await reconcileModules(
    client,
    program.programVersionId,
    isContentEditable,
    allowArchive,
    content.modules,
  );

  const promptVersions = await reconcilePrompts(
    client,
    content.prompts,
    program.contentLock,
  );

  await reconcileModulePromptBindings(
    client,
    isContentEditable,
    allowArchive,
    modules,
    promptVersions,
    content.promptBindings,
  );

  const expectedModulePromptBindingCounts = new Map<string, number>();
  for (const binding of content.promptBindings) {
    expectedModulePromptBindingCounts.set(
      binding.moduleKey,
      (expectedModulePromptBindingCounts.get(binding.moduleKey) ?? 0) + 1,
    );
  }

  // Re-activate on every seed so living V1 additions do not stay draft forever.
  const activation = await activateReconciledContent(client, {
    modules,
    promptVersions,
    expectedModulePromptBindingCounts,
  });

  if (isFirstPublish) {
    await markProgramVersionPublished(client, program.programVersionId);
  }

  return {
    programId: program.programId,
    programVersionId: program.programVersionId,
    programVersionStatus: isFirstPublish
      ? "published"
      : program.programVersionStatus,
    contentLock: program.contentLock,
    modulesReconciled: modules.length,
    promptsReconciled: promptVersions.length,
    published: isFirstPublish,
    promptVersionsActivated: activation.promptVersionsPublished,
    modulesActivated: activation.modulesActivated,
  };
}

export { DEFAULT_TOOLKIT_CONTENT } from "./content/index.js";
export { ContentSeedError } from "./errors.js";
export type { ContentSeedErrorCode } from "./errors.js";
export type { ToolkitSeedContent } from "./types.js";
