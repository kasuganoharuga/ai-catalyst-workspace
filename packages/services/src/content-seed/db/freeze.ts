import type { PoolClient } from "pg";

import { planBranchReconciliation } from "../../workflow/internal/reconcile-run-modules.js";
import { ContentSeedError } from "../errors.js";
import { seedToolkitContent } from "../index.js";
import type { ToolkitSeedContent } from "../types.js";

export interface FreezeParams {
  content: ToolkitSeedContent;
  /**
   * Proceed even if a prompt about to be cascade-frozen is also reachable
   * from a DIFFERENT program_version that is itself still mutable — see
   * assertNoUnsafeSharedMutablePromptDependencies below. Off by default:
   * this is a real, if rare, cross-program interaction and deserves an
   * explicit decision, not a silent cascade.
   */
  allowSharedPromptFreeze?: boolean;
}

export interface FreezeResult {
  programVersionId: string;
  versionLabel: string;
  frozenPromptVersions: Array<{ promptKey: string; versionNumber: number }>;
}

/**
 * freeze is NOT just "flip content_lock to frozen" — it permanently
 * strands whatever every non-archived Program Run's program_run_modules
 * currently looks like. If any Run still has Modules/renames/reorders it
 * hasn't picked up yet, freezing now means it never will (see
 * planBranchReconciliation's read-only reconciliation plan — once
 * content_lock is frozen, it always returns skippedFrozen:true and never
 * writes anything again). So freeze refuses outright if any Run's plan is
 * non-empty, rather than quietly leaving that Run's drift permanent.
 *
 * Uses the SAME `planBranchReconciliation` (L1, read-only) that
 * `getOrCreateProgramRun`'s lazy front-fill and the `db:reconcile-runs`
 * batch CLI both use to actually apply changes — reusing the identical
 * algorithm here (rather than a separate "just check for missing rows"
 * query) is what makes this check catch every kind of drift
 * (missing/title/sequence/promotion), not just the narrower "some Module
 * hasn't been inserted yet" case a naive check would miss.
 */
async function assertNoPendingRunReconciliation(
  client: PoolClient,
  programVersionId: string,
): Promise<void> {
  const runsResult = await client.query<{ id: string }>(
    `select id from program_runs where program_version_id = $1 and status <> 'archived'`,
    [programVersionId],
  );

  const pending: string[] = [];
  for (const run of runsResult.rows) {
    // Only 'open' Branches — matches reconcileProgramRunInTransaction's
    // own scope (see its doc comment for why 'completed'/'archived'
    // Branches are out of scope).
    const branchesResult = await client.query<{ id: string }>(
      `select id from program_run_branches where program_run_id = $1 and status = 'open'`,
      [run.id],
    );
    for (const branch of branchesResult.rows) {
      const plan = await planBranchReconciliation(client, { branchId: branch.id, programVersionId });
      if (plan.isEmpty) {
        continue;
      }
      const parts: string[] = [];
      if (plan.missing.length > 0) parts.push(`${plan.missing.length} missing Module(s)`);
      if (plan.titleUpdates.length > 0) parts.push(`${plan.titleUpdates.length} title update(s)`);
      if (plan.sequenceUpdates.length > 0) parts.push(`${plan.sequenceUpdates.length} sequence update(s)`);
      if (plan.promotions.length > 0) parts.push(`${plan.promotions.length} promotion(s)`);
      pending.push(`  Run ${run.id} / Branch ${branch.id}: ${parts.join(", ")}`);
    }
  }

  if (pending.length > 0) {
    throw new ContentSeedError(
      "RUN_RECONCILIATION_PENDING",
      `Cannot freeze program_version ${programVersionId}: ${pending.length} Run/Branch(es) still have a ` +
        `pending reconciliation. Run "pnpm db:reconcile-runs" first, then retry.\n${pending.join("\n")}`,
    );
  }
}

interface SharedMutablePromptRow {
  prompt_key: string;
  version_number: number;
  other_program_key: string;
  other_version_label: string;
}

/**
 * A prompt is global (prompt_definitions/prompt_versions have no
 * program_version_id column) and may be bound, via module_prompt_bindings,
 * to Modules under several different program_versions at once.
 * (program_prompt_bindings is schema-defined but unused by every current
 * write path — content-seed/db/prompts.ts never populates it — so it's
 * not queried here.)
 *
 * Freezing cascades to every mutable prompt_version reachable from THIS
 * program_version (see freezeProgramVersion below) — "reachable from a
 * different, still-mutable program_version too" is the one case where
 * that cascade has a side effect outside this program_version: it would
 * silently take editing rights away from whoever is still iterating on
 * that prompt under the other program_version.
 */
async function findUnsafeSharedMutablePromptDependencies(
  client: PoolClient,
  programVersionId: string,
): Promise<SharedMutablePromptRow[]> {
  const result = await client.query<SharedMutablePromptRow>(
    `with reachable_prompts as (
       select distinct pv.id as prompt_version_id, pd.prompt_key, pv.version_number
       from module_prompt_bindings mpb
       join module_definitions md on md.id = mpb.module_definition_id
       join prompt_versions pv on pv.id = mpb.prompt_version_id
       join prompt_definitions pd on pd.id = pv.prompt_definition_id
       where md.program_version_id = $1
         and pv.content_lock = 'mutable'
     )
     select distinct
       rp.prompt_key,
       rp.version_number,
       op.program_key as other_program_key,
       opv.version_label as other_version_label
     from reachable_prompts rp
     join module_prompt_bindings other_mpb on other_mpb.prompt_version_id = rp.prompt_version_id
     join module_definitions other_md
       on other_md.id = other_mpb.module_definition_id
      and other_md.program_version_id <> $1
     join program_versions opv
       on opv.id = other_md.program_version_id
      and opv.content_lock = 'mutable'
     join programs op on op.id = opv.program_id`,
    [programVersionId],
  );
  return result.rows;
}

/**
 * Freezes ONE program_version: seeds `content` one last time (so the DB
 * matches it exactly before anything is made immutable), verifies every
 * Run against it is already fully reconciled, cascades content_lock to
 * every mutable prompt_version it reaches (subject to the shared-mutable
 * preflight above), then freezes the program_version itself.
 *
 * Single transaction, held under `client`'s exclusive SEED_LOCK (acquired
 * by seedToolkitContent's own `pg_advisory_xact_lock` call below — freeze
 * does not acquire it a second time, the same key is simply re-entrant
 * within one session/transaction). Nothing here ever takes a Venture
 * lock — see reconcile-run-modules.ts's lock-order doc comment for why
 * that must stay true to avoid deadlocking against getOrCreateProgramRun.
 */
export async function freezeProgramVersion(
  client: PoolClient,
  params: FreezeParams,
): Promise<FreezeResult> {
  const { content, allowSharedPromptFreeze = false } = params;

  // Re-seed one last time: freeze is "make what's in the DB right now
  // permanent", so the DB must match `content` exactly first. If content
  // has drifted (or this program_version was never actually mutable),
  // seedToolkitContent itself raises the appropriate ContentSeedError.
  const seedResult = await seedToolkitContent(client, content, { allowArchive: false });

  if (seedResult.contentLock !== "mutable") {
    throw new ContentSeedError(
      "PROGRAM_VERSION_NOT_MUTABLE",
      `program_version ${seedResult.programVersionId} is content_lock=${seedResult.contentLock}; ` +
        "only a mutable ('living') program_version can be frozen.",
    );
  }

  await assertNoPendingRunReconciliation(client, seedResult.programVersionId);

  const sharedDependencies = await findUnsafeSharedMutablePromptDependencies(
    client,
    seedResult.programVersionId,
  );
  if (sharedDependencies.length > 0 && !allowSharedPromptFreeze) {
    const describe = sharedDependencies
      .map(
        (row) =>
          `  ${row.prompt_key} v${row.version_number} — also mutable under ` +
          `${row.other_program_key} / ${row.other_version_label}`,
      )
      .join("\n");
    throw new ContentSeedError(
      "SHARED_MUTABLE_PROMPT_DEPENDENCY",
      `Cannot freeze program_version ${seedResult.programVersionId}: ${sharedDependencies.length} ` +
        `prompt_version(s) it would freeze are still mutable under a DIFFERENT program_version too:\n` +
        `${describe}\nFreezing here would take away that other program_version's ability to keep ` +
        "editing them in place. Pass --allow-shared-prompt-freeze to freeze them anyway (that other " +
        "program_version's next edit to any of these will then have to bump versionNumber).",
    );
  }

  // Cascade: every mutable prompt_version reachable from this
  // program_version's Modules, frozen in one statement — content_lock is
  // the ONLY column this touches, per prompt_versions_freeze()'s "changed
  // on its own" trigger rule (0012_content_lock.sql).
  const frozenPromptsResult = await client.query<{ prompt_key: string; version_number: number }>(
    `with reachable as (
       select distinct pv.id
       from module_prompt_bindings mpb
       join module_definitions md on md.id = mpb.module_definition_id
       join prompt_versions pv on pv.id = mpb.prompt_version_id
       where md.program_version_id = $1
         and pv.content_lock = 'mutable'
     )
     update prompt_versions
     set content_lock = 'frozen'
     where id in (select id from reachable)
     returning
       (select prompt_key from prompt_definitions where id = prompt_versions.prompt_definition_id) as prompt_key,
       version_number`,
    [seedResult.programVersionId],
  );

  // Freeze the program_version itself — content_lock is the ONLY column
  // this touches, same trigger rule as above.
  await client.query(`update program_versions set content_lock = 'frozen' where id = $1`, [
    seedResult.programVersionId,
  ]);

  return {
    programVersionId: seedResult.programVersionId,
    versionLabel: content.program.versionLabel,
    frozenPromptVersions: frozenPromptsResult.rows.map((row) => ({
      promptKey: row.prompt_key,
      versionNumber: row.version_number,
    })),
  };
}
