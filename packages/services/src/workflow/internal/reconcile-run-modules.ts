import type { PoolClient } from "pg";

import { pool } from "@ai-catalyst/db";

import { ServiceError } from "@ai-catalyst/services/errors";

// Must match content-seed/index.ts SEED_LOCK_KEY so seed and reconcile serialize together.
const SEED_LOCK_KEY = 727_310_101;

// Postgres `sequence_index` on program_run_modules is a plain `integer`.
const MAX_SEQUENCE_VALUE = 2_147_483_647;
const SAFE_GAP = 1000;

export type RunModuleStatus =
  | "locked"
  | "inherited"
  | "available"
  | "in_progress"
  | "ready_to_unlock"
  | "completed";

export interface ActiveDefinitionRow {
  id: string;
  moduleKey: string;
  title: string;
  sequenceIndex: number;
}

export interface ExistingRunModuleRow {
  id: string;
  moduleDefinitionId: string;
  titleSnapshot: string;
  sequenceIndex: number;
  status: RunModuleStatus;
}

export interface RunModuleReconciliationPlan {
  branchId: string;
  programVersionId: string;
  /** True when content_lock='frozen'; plan is empty and no writes run. */
  skippedFrozen: boolean;
  /** Rows to insert with computed initial status. */
  missing: Array<{
    moduleDefinitionId: string;
    moduleKey: string;
    title: string;
    finalSequenceIndex: number;
    status: "available" | "locked";
  }>;
  /** title_snapshot out of sync with module_definitions.title. */
  titleUpdates: Array<{ id: string; title: string }>;
  /** sequence_index changes for active-chain or orphaned rows. */
  sequenceUpdates: Array<{ id: string; finalSequenceIndex: number }>;
  /** locked -> available only; monotonic by construction. */
  promotions: string[];
  /** Archived-definition rows; resequenced to tail, status untouched. */
  orphanedIds: string[];
  /** Temporary offset for sequence shift; 0 when isEmpty. */
  offset: number;
  /** True when no writes should run. */
  isEmpty: boolean;
}

function emptyPlan(
  branchId: string,
  programVersionId: string,
  skippedFrozen: boolean,
  orphanedIds: string[] = [],
): RunModuleReconciliationPlan {
  return {
    branchId,
    programVersionId,
    skippedFrozen,
    missing: [],
    titleUpdates: [],
    sequenceUpdates: [],
    promotions: [],
    orphanedIds,
    offset: 0,
    isEmpty: true,
  };
}

/**
 * Pure plan computation — no I/O. Access is monotonic: existing rows are never relocked;
 * only locked -> available promotions. Orphans skip the active-chain walk and are
 * resequenced after the chain so branch_sequence_unique never collides.
 */
export function computeBranchReconciliationPlan(
  branchId: string,
  programVersionId: string,
  activeDefs: ActiveDefinitionRow[],
  current: ExistingRunModuleRow[],
): RunModuleReconciliationPlan {
  const currentByDefId = new Map(
    current.map((row) => [row.moduleDefinitionId, row]),
  );
  const activeDefIds = new Set(activeDefs.map((def) => def.id));

  const missing: RunModuleReconciliationPlan["missing"] = [];
  const titleUpdates: RunModuleReconciliationPlan["titleUpdates"] = [];
  const sequenceUpdates: RunModuleReconciliationPlan["sequenceUpdates"] = [];
  const promotions: string[] = [];

  let predecessorAllowsAccess = true; // no predecessor at all = chain head = always allowed
  for (const def of activeDefs) {
    const existing = currentByDefId.get(def.id);
    if (!existing) {
      const status = predecessorAllowsAccess ? "available" : "locked";
      missing.push({
        moduleDefinitionId: def.id,
        moduleKey: def.moduleKey,
        title: def.title,
        finalSequenceIndex: def.sequenceIndex,
        status,
      });
      predecessorAllowsAccess = false; // a freshly inserted row is never itself completed/inherited
      continue;
    }

    if (existing.titleSnapshot !== def.title) {
      titleUpdates.push({ id: existing.id, title: def.title });
    }
    if (existing.sequenceIndex !== def.sequenceIndex) {
      sequenceUpdates.push({
        id: existing.id,
        finalSequenceIndex: def.sequenceIndex,
      });
    }

    let effectiveStatus = existing.status;
    if (existing.status === "locked" && predecessorAllowsAccess) {
      promotions.push(existing.id);
      effectiveStatus = "available";
    }
    predecessorAllowsAccess =
      effectiveStatus === "completed" || effectiveStatus === "inherited";
  }

  // Orphans: tail after active chain, relative order preserved; status never touched.
  const orphaned = current
    .filter((row) => !activeDefIds.has(row.moduleDefinitionId))
    .slice()
    .sort((a, b) => a.sequenceIndex - b.sequenceIndex);
  const orphanedIds = orphaned.map((row) => row.id);

  const activeMaxSequence = activeDefs.reduce(
    (max, def) => Math.max(max, def.sequenceIndex),
    0,
  );
  orphaned.forEach((row, index) => {
    const finalSequenceIndex = activeMaxSequence + 1 + index;
    if (row.sequenceIndex !== finalSequenceIndex) {
      sequenceUpdates.push({ id: row.id, finalSequenceIndex });
    }
  });

  const isEmpty =
    missing.length === 0 &&
    titleUpdates.length === 0 &&
    sequenceUpdates.length === 0 &&
    promotions.length === 0;

  if (isEmpty) {
    return emptyPlan(branchId, programVersionId, false, orphanedIds);
  }

  // branch_sequence_unique is not partial — offset clears space against every row in the Branch.
  const currentMaxSequence = current.reduce(
    (max, row) => Math.max(max, row.sequenceIndex),
    0,
  );
  const desiredMaxSequence =
    orphaned.length > 0
      ? activeMaxSequence + orphaned.length
      : activeMaxSequence;
  const offset = Math.max(currentMaxSequence, desiredMaxSequence) + SAFE_GAP;

  if (currentMaxSequence + offset > MAX_SEQUENCE_VALUE) {
    throw new ServiceError(
      "INTERNAL_INVARIANT_ERROR",
      `reconcileRunModules: resequencing branch ${branchId} would push sequence_index past ` +
        `${MAX_SEQUENCE_VALUE} (currentMax=${currentMaxSequence}, offset=${offset}).`,
    );
  }

  return {
    branchId,
    programVersionId,
    skippedFrozen: false,
    missing,
    titleUpdates,
    sequenceUpdates,
    promotions,
    orphanedIds,
    offset,
    isEmpty: false,
  };
}

/**
 * Read-only planner for one Branch. Caller MUST hold SEED_LOCK_KEY (shared or exclusive).
 * Does not need the Venture lock — db:freeze preflight uses this under exclusive SEED_LOCK only.
 */
export async function planBranchReconciliation(
  client: PoolClient,
  params: { branchId: string; programVersionId: string },
): Promise<RunModuleReconciliationPlan> {
  const { branchId, programVersionId } = params;

  const lockResult = await client.query<{ content_lock: "mutable" | "frozen" }>(
    `select content_lock from program_versions where id = $1`,
    [programVersionId],
  );
  if (lockResult.rows[0]?.content_lock !== "mutable") {
    return emptyPlan(branchId, programVersionId, true);
  }

  const activeDefsResult = await client.query<{
    id: string;
    module_key: string;
    title: string;
    sequence_index: number;
  }>(
    `select id, module_key, title, sequence_index
     from module_definitions
     where program_version_id = $1 and status = 'active'
     order by sequence_index`,
    [programVersionId],
  );
  const activeDefs: ActiveDefinitionRow[] = activeDefsResult.rows.map(
    (row) => ({
      id: row.id,
      moduleKey: row.module_key,
      title: row.title,
      sequenceIndex: row.sequence_index,
    }),
  );

  const currentResult = await client.query<{
    id: string;
    module_definition_id: string;
    title_snapshot: string;
    sequence_index: number;
    status: RunModuleStatus;
  }>(
    `select id, module_definition_id, title_snapshot, sequence_index, status
     from program_run_modules
     where program_run_branch_id = $1`,
    [branchId],
  );
  const current: ExistingRunModuleRow[] = currentResult.rows.map((row) => ({
    id: row.id,
    moduleDefinitionId: row.module_definition_id,
    titleSnapshot: row.title_snapshot,
    sequenceIndex: row.sequence_index,
    status: row.status,
  }));

  return computeBranchReconciliationPlan(
    branchId,
    programVersionId,
    activeDefs,
    current,
  );
}

/**
 * Applies a reconciliation plan; no-ops when plan.isEmpty.
 * Caller MUST hold Venture row lock AND SEED_LOCK_KEY (shared).
 * Lock order: Venture -> SEED_LOCK_KEY. seed/freeze take exclusive SEED_LOCK only — never reverse.
 */
export async function applyBranchReconciliation(
  client: PoolClient,
  plan: RunModuleReconciliationPlan,
): Promise<void> {
  if (plan.isEmpty) {
    return;
  }

  const rowsNeedingShift = plan.sequenceUpdates.map((row) => row.id);
  if (rowsNeedingShift.length > 0) {
    await client.query(
      `update program_run_modules set sequence_index = sequence_index + $1 where id = any($2::uuid[])`,
      [plan.offset, rowsNeedingShift],
    );
  }

  for (const row of plan.sequenceUpdates) {
    await client.query(
      `update program_run_modules set sequence_index = $1 where id = $2`,
      [row.finalSequenceIndex, row.id],
    );
  }

  for (const row of plan.titleUpdates) {
    await client.query(
      `update program_run_modules set title_snapshot = $1, updated_at = now() where id = $2`,
      [row.title, row.id],
    );
  }

  if (plan.promotions.length > 0) {
    // Re-verify status='locked' — plan came from an earlier SELECT, not under row lock.
    await client.query(
      `update program_run_modules
       set status = 'available', unlocked_at = now(), updated_at = now()
       where id = any($1::uuid[]) and status = 'locked'`,
      [plan.promotions],
    );
  }

  if (plan.missing.length > 0) {
    // Branch workspace_id/program_run_id looked up here so plans stay serializable.
    const branchResult = await client.query<{
      workspace_id: string;
      program_run_id: string;
    }>(
      `select workspace_id, program_run_id from program_run_branches where id = $1`,
      [plan.branchId],
    );
    const branch = branchResult.rows[0];
    if (!branch) {
      throw new ServiceError(
        "INTERNAL_INVARIANT_ERROR",
        `reconcileRunModules: program_run_branches ${plan.branchId} not found.`,
      );
    }
    for (const row of plan.missing) {
      await client.query(
        `insert into program_run_modules (
           workspace_id, program_run_id, program_version_id, program_run_branch_id,
           module_definition_id, module_key, title_snapshot, sequence_index, status, unlocked_at
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          branch.workspace_id,
          branch.program_run_id,
          plan.programVersionId,
          plan.branchId,
          row.moduleDefinitionId,
          row.moduleKey,
          row.title,
          row.finalSequenceIndex,
          row.status,
          row.status === "available" ? new Date() : null,
        ],
      );
    }
  }
}

export { SEED_LOCK_KEY as RUN_MODULE_RECONCILE_LOCK_KEY };

export interface RunReconciliationSummary {
  skippedFrozen: boolean;
  branchesReconciled: number;
  missingInserted: number;
  titlesUpdated: number;
  sequencesUpdated: number;
  promoted: number;
}

function emptyRunReconciliationSummary(
  skippedFrozen: boolean,
): RunReconciliationSummary {
  return {
    skippedFrozen,
    branchesReconciled: 0,
    missingInserted: 0,
    titlesUpdated: 0,
    sequencesUpdated: 0,
    promoted: 0,
  };
}

/**
 * Reconciles every 'open' Branch of one Run. Caller must already hold Venture lock + SEED_LOCK_KEY.
 * Only 'open' branches — archived/completed branches are out of scope.
 */
export async function reconcileProgramRunInTransaction(
  client: PoolClient,
  params: { programRunId: string; programVersionId: string },
): Promise<RunReconciliationSummary> {
  // content_lock is per program_version — one check avoids N redundant SELECTs per Branch.
  const lockResult = await client.query<{ content_lock: "mutable" | "frozen" }>(
    `select content_lock from program_versions where id = $1`,
    [params.programVersionId],
  );
  if (lockResult.rows[0]?.content_lock !== "mutable") {
    return emptyRunReconciliationSummary(true);
  }

  const branchesResult = await client.query<{ id: string }>(
    `select id from program_run_branches where program_run_id = $1 and status = 'open'`,
    [params.programRunId],
  );

  const summary = emptyRunReconciliationSummary(false);
  summary.branchesReconciled = branchesResult.rows.length;
  for (const branch of branchesResult.rows) {
    const plan = await planBranchReconciliation(client, {
      branchId: branch.id,
      programVersionId: params.programVersionId,
    });
    await applyBranchReconciliation(client, plan);
    summary.missingInserted += plan.missing.length;
    summary.titlesUpdated += plan.titleUpdates.length;
    summary.sequencesUpdated += plan.sequenceUpdates.length;
    summary.promoted += plan.promotions.length;
  }

  return summary;
}

/**
 * Standalone wrapper: owns transaction, Venture lock, and shared SEED_LOCK.
 * getOrCreateProgramRun must call reconcileProgramRunInTransaction directly instead.
 */
export async function reconcileProgramRun(
  programRunId: string,
): Promise<RunReconciliationSummary> {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const runResult = await client.query<{
      id: string;
      venture_id: string;
      program_version_id: string;
    }>(
      `select id, venture_id, program_version_id from program_runs where id = $1`,
      [programRunId],
    );
    const run = runResult.rows[0];
    if (!run) {
      throw new ServiceError(
        "NOT_FOUND",
        `Program Run ${programRunId} not found.`,
      );
    }

    await client.query(`select id from ventures where id = $1 for update`, [
      run.venture_id,
    ]);
    await client.query("select pg_advisory_xact_lock_shared($1)", [
      SEED_LOCK_KEY,
    ]);

    const summary = await reconcileProgramRunInTransaction(client, {
      programRunId: run.id,
      programVersionId: run.program_version_id,
    });

    await client.query("commit");
    return summary;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
