import type { PoolClient } from "pg";

import { planBranchReconciliation } from "../../workflow/internal/reconcile-run-modules.js";
import { ContentSeedError } from "../errors.js";
import { seedToolkitContent } from "../index.js";
import type { ToolkitSeedContent } from "../types.js";

export interface FreezeParams {
  content: ToolkitSeedContent;
  /**
   * Proceed when a prompt to freeze is still mutable under another program_version.
   * Off by default — cross-program cascade deserves an explicit decision.
   */
  allowSharedPromptFreeze?: boolean;
}

export interface FreezeResult {
  programVersionId: string;
  versionLabel: string;
  frozenPromptVersions: Array<{ promptKey: string; versionNumber: number }>;
}

/**
 * Refuses freeze when any Run still has pending reconciliation — freezing strands
 * unreconciled program_run_modules permanently.
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
    // Open branches only — matches reconcileProgramRunInTransaction scope.
    const branchesResult = await client.query<{ id: string }>(
      `select id from program_run_branches where program_run_id = $1 and status = 'open'`,
      [run.id],
    );
    for (const branch of branchesResult.rows) {
      const plan = await planBranchReconciliation(client, {
        branchId: branch.id,
        programVersionId,
      });
      if (plan.isEmpty) {
        continue;
      }
      const parts: string[] = [];
      if (plan.missing.length > 0)
        parts.push(`${plan.missing.length} missing Module(s)`);
      if (plan.titleUpdates.length > 0)
        parts.push(`${plan.titleUpdates.length} title update(s)`);
      if (plan.sequenceUpdates.length > 0)
        parts.push(`${plan.sequenceUpdates.length} sequence update(s)`);
      if (plan.promotions.length > 0)
        parts.push(`${plan.promotions.length} promotion(s)`);
      pending.push(
        `  Run ${run.id} / Branch ${branch.id}: ${parts.join(", ")}`,
      );
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
 * Prompts are global; freezing here cascades to mutable versions reachable from this
 * program_version — including ones still edited under another mutable program_version.
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
 * Re-seeds, verifies Runs are reconciled, optionally checks shared mutable prompts,
 * cascades prompt freeze, then freezes the program_version — all under SEED_LOCK.
 */
export async function freezeProgramVersion(
  client: PoolClient,
  params: FreezeParams,
): Promise<FreezeResult> {
  const { content, allowSharedPromptFreeze = false } = params;

  // Final seed so frozen state matches content exactly.
  const seedResult = await seedToolkitContent(client, content, {
    allowArchive: false,
  });

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

  // Cascade content_lock to every mutable prompt_version reachable from this program_version.
  const frozenPromptsResult = await client.query<{
    prompt_key: string;
    version_number: number;
  }>(
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

  // content_lock only — per prompt_versions_freeze trigger rule.
  await client.query(
    `update program_versions set content_lock = 'frozen' where id = $1`,
    [seedResult.programVersionId],
  );

  return {
    programVersionId: seedResult.programVersionId,
    versionLabel: content.program.versionLabel,
    frozenPromptVersions: frozenPromptsResult.rows.map((row) => ({
      promptKey: row.prompt_key,
      versionNumber: row.version_number,
    })),
  };
}
