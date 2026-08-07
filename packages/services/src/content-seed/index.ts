import type { PoolClient } from "pg";

import { DEFAULT_TOOLKIT_CONTENT } from "./content/index.js";
import { activateReconciledContent, markProgramVersionPublished } from "./db/publish.js";
import { reconcileModules } from "./db/modules.js";
import { reconcileModulePromptBindings, reconcilePrompts } from "./db/prompts.js";
import { reconcileProgram } from "./db/program.js";
import type { ToolkitSeedContent } from "./types.js";

// Fixed advisory lock key — any distinct bigint works as long as it never
// collides with another advisory lock user of this database. Picked
// arbitrarily; must never change once in use.
const SEED_LOCK_KEY = 727_310_101;

export interface SeedOptions {
  /**
   * Guards every archive (Module/Question/Artifact) and hard-delete
   * (module_prompt_bindings) this run would otherwise perform. Off by
   * default: an import bug or bad merge that silently drops content out
   * of the constants must fail the seed run loudly, not archive real
   * content on deploy. Pass true (or set ALLOW_DESTRUCTIVE_CONTENT_CHANGE=1
   * at the CLI) once you've confirmed the removal is intentional.
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
  /** Non-zero only on a "living" (content_lock='mutable') re-seed that activates something newly added since the last seed — see db/publish.ts's activateReconciledContent. */
  promptVersionsActivated: number;
  modulesActivated: number;
}

/**
 * Idempotently reconciles `content` (defaults to the reviewed canonical
 * content) into the database. On first publish (programVersionStatus was
 * "draft" at the start of this run), also activates and publishes it. On
 * every subsequent run against an already-published, content_lock='mutable'
 * ("living") program_version, re-reconciles and re-activates in place —
 * this is what lets a newly added Module or a changed Prompt take effect
 * without ever creating a new program_version (see db/publish.ts's
 * activateReconciledContent, which — unlike the old one-shot
 * publishProgramVersion — is safe to call on every seed run, not just the
 * first one).
 *
 * Callers must open the transaction themselves before calling this and
 * commit/rollback it afterwards — this function issues no begin/commit/
 * rollback of its own, both so the advisory lock below actually spans the
 * whole reconcile+activate sequence (pg_advisory_xact_lock is a no-op
 * outside an explicit transaction block) and so tests can call it
 * directly against a client whose transaction they control.
 */
export async function seedToolkitContent(
  client: PoolClient,
  content: ToolkitSeedContent = DEFAULT_TOOLKIT_CONTENT,
  options: SeedOptions = {},
): Promise<SeedResult> {
  const allowArchive = options.allowArchive ?? false;

  // Transaction-scoped advisory lock: released automatically on commit or
  // rollback, so two concurrent seed runs never interleave their inserts
  // and race a unique-constraint violation instead of one simply waiting
  // for the other. Also the lock reconcileRunModules takes in shared mode
  // (see workflow/internal/reconcile-run-modules.ts) before reading any
  // content_lock or module_definitions row — this exclusive hold is what
  // makes this whole reconcile+activate sequence atomic with respect to a
  // concurrent Program Run being created or reconciled.
  await client.query("select pg_advisory_xact_lock($1)", [SEED_LOCK_KEY]);

  const program = await reconcileProgram(client, content.program);
  // Content is editable either before first publish (draft), or forever
  // afterwards if this program_version is a "living" one
  // (content_lock='mutable') — see db/program.ts's
  // isProgramVersionContentEditable, which reconcileProgram already
  // applied against the database row (the authoritative source, not this
  // content constant) to decide programVersionStatus/contentLock.
  const isFirstPublish = program.programVersionStatus === "draft";
  const isContentEditable = isFirstPublish || program.contentLock === "mutable";

  const modules = await reconcileModules(
    client,
    program.programVersionId,
    isContentEditable,
    allowArchive,
    content.modules,
  );

  const promptVersions = await reconcilePrompts(client, content.prompts, program.contentLock);

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

  // Runs every time, not just on first publish — this is the fix for the
  // core living-V1 gap: the old publishProgramVersion only ever ran once,
  // so a Module or Prompt Version added after first publish would sit at
  // status='draft' forever. See activateReconciledContent's own doc
  // comment for why each step is idempotent rather than asserting an
  // exact rowCount.
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
    programVersionStatus: isFirstPublish ? "published" : program.programVersionStatus,
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
