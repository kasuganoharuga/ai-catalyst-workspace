import type { PoolClient } from "pg";

import { pool } from "@ai-catalyst/db";

import { ServiceError } from "@ai-catalyst/services/errors";

// Fixed advisory lock key — must be the SAME key content-seed/index.ts's
// seedToolkitContent uses (SEED_LOCK_KEY there), not a new one: the two
// only serialize against each other correctly if they contend on the same
// lock. See the lock-order invariant on applyBranchReconciliation below.
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
  /**
   * True when the program_version is content_lock='frozen'. Every other
   * field is forced empty and `isEmpty` is forced true — this is the
   * mechanism that makes a frozen V1's Run permanently stop following
   * content changes, restoring today's "bound at creation, never moves"
   * semantics once V1 is frozen (see content-seed's db:freeze CLI).
   */
  skippedFrozen: boolean;
  /**
   * New program_run_modules rows to insert, already carrying their
   * computed initial status — see computeBranchReconciliationPlan's
   * single forward walk over the active chain for why a freshly inserted
   * row's status can be computed in the same pass as everything else.
   */
  missing: Array<{
    moduleDefinitionId: string;
    moduleKey: string;
    title: string;
    finalSequenceIndex: number;
    status: "available" | "locked";
  }>;
  /** Existing rows whose title_snapshot no longer matches module_definitions.title. */
  titleUpdates: Array<{ id: string; title: string }>;
  /** Existing rows (active-chain or orphaned) whose sequence_index is changing. */
  sequenceUpdates: Array<{ id: string; finalSequenceIndex: number }>;
  /** Existing 'locked' rows to promote to 'available' — never any other transition; monotonic by construction (see the doc comment below). */
  promotions: string[];
  /** Rows whose module_definitions is archived — kept, never promoted/inserted-before, only possibly resequenced to the tail. Count only; nothing else acts on these ids. */
  orphanedIds: string[];
  /** The temporary offset sequenceUpdates' shift step would use — 0 when isEmpty. */
  offset: number;
  /** False iff every array above is empty (aside from a true skippedFrozen, which always implies isEmpty). No write of any kind should be issued when this is true. */
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
 * Pure computation core — no I/O. Takes already-fetched rows and produces
 * a plan; unit-testable in isolation without a database (see
 * reconcile-run-modules.test.ts), which matters here more than for most
 * of this codebase given how many subtle ordering bugs this exact
 * algorithm went through review to catch.
 *
 * ## Living-content access is monotonic
 *
 * New or reordered Modules may become `available`; an already
 * available/in_progress/ready_to_unlock/completed/inherited Module is
 * NEVER relocked. The single forward walk below only ever promotes an
 * existing row from `locked` to `available` — it never assigns any other
 * status to an existing row — so this invariant holds by construction,
 * not by a separate check.
 *
 * ## Why one forward walk handles both "insert" and "repair"
 *
 * `activeDefs` must already be every module_definitions row with
 * status='active', in module_definitions.sequence_index order — a total
 * order, since that column is unique per program_version. Walking it in
 * order and asking one question at each step — "does the immediately
 * preceding position in TODAY's chain allow access?" — automatically
 * covers every case a two-pass insert-then-repair design would need
 * separately:
 *   - two consecutive missing Modules: the first one's computed status
 *     becomes the second one's predecessor state in the very same walk,
 *     so "M2 available, M3 locked" falls out without a second pass.
 *   - archiving the first active Module: the walk simply starts at what
 *     is now index 0 of the chain with no predecessor at all, which
 *     counts as "allows access" — so a previously-locked second Module
 *     is promoted the moment it becomes the chain's head, with no special
 *     case for "was there ever a predecessor".
 *   - a stale "completed -> locked -> completed" chain left over from an
 *     old ordering: the locked row's predecessor in TODAY's chain is
 *     recomputed fresh, so if that predecessor is completed/inherited,
 *     the walk promotes it right there.
 *
 * ## Orphans never participate in the active chain
 *
 * A row whose moduleDefinitionId is not in `activeDefs` (its Module
 * Definition was archived) is excluded from the walk entirely — it can
 * never be a "predecessor" for access-check purposes, and its own status
 * is never touched. It is moved (if needed) to a sequence_index after
 * every active-chain position, in its own relative order, purely so
 * program_run_modules_branch_sequence_unique (which — unlike
 * module_definitions' equivalent — is NOT partial and does not exclude
 * archived-definition rows) never collides with an active-chain row that
 * needs its old slot.
 */
export function computeBranchReconciliationPlan(
  branchId: string,
  programVersionId: string,
  activeDefs: ActiveDefinitionRow[],
  current: ExistingRunModuleRow[],
): RunModuleReconciliationPlan {
  const currentByDefId = new Map(current.map((row) => [row.moduleDefinitionId, row]));
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
      sequenceUpdates.push({ id: existing.id, finalSequenceIndex: def.sequenceIndex });
    }

    let effectiveStatus = existing.status;
    if (existing.status === "locked" && predecessorAllowsAccess) {
      promotions.push(existing.id);
      effectiveStatus = "available";
    }
    predecessorAllowsAccess = effectiveStatus === "completed" || effectiveStatus === "inherited";
  }

  // Orphans: pushed after every active-chain position, preserving their
  // relative order to each other (stable sort by their own current
  // sequence_index) — never promoted, never a predecessor, status never
  // touched.
  const orphaned = current
    .filter((row) => !activeDefIds.has(row.moduleDefinitionId))
    .slice()
    .sort((a, b) => a.sequenceIndex - b.sequenceIndex);
  const orphanedIds = orphaned.map((row) => row.id);

  const activeMaxSequence = activeDefs.reduce((max, def) => Math.max(max, def.sequenceIndex), 0);
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

  // Every row currently in the Branch competes for sequence_index
  // uniqueness (program_run_modules_branch_sequence_unique has no partial
  // predicate, unlike module_definitions' equivalent) — so, unlike
  // content-seed/db/reconcile-ordered-rows.ts's definition-table
  // algorithm, there is no "archived rows exit the competition"
  // shortcut here. The temporary offset must clear space against every
  // row currently in the Branch, not just the ones about to move.
  const currentMaxSequence = current.reduce((max, row) => Math.max(max, row.sequenceIndex), 0);
  const desiredMaxSequence =
    orphaned.length > 0 ? activeMaxSequence + orphaned.length : activeMaxSequence;
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
 * Read-only planner for ONE Branch — fetches the rows
 * computeBranchReconciliationPlan needs and delegates to it. Issues only
 * SELECTs.
 *
 * Caller MUST hold `SEED_LOCK_KEY` (shared or exclusive — either is fine,
 * since this never writes) before calling this, so the content-definition
 * graph it reads cannot change mid-computation. It does NOT require the
 * Venture/Run serialization lock `getOrCreateProgramRun` takes — that lock
 * exists to serialize *writes* to this Branch, which a read-only plan
 * doesn't need. This is exactly what lets db:freeze's preflight call this
 * directly under its own exclusive SEED_LOCK without ever taking a
 * Venture lock — see the lock-order note on applyBranchReconciliation.
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
  const activeDefs: ActiveDefinitionRow[] = activeDefsResult.rows.map((row) => ({
    id: row.id,
    moduleKey: row.module_key,
    title: row.title,
    sequenceIndex: row.sequence_index,
  }));

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

  return computeBranchReconciliationPlan(branchId, programVersionId, activeDefs, current);
}

/**
 * Applies a plan from planBranchReconciliation/computeBranchReconciliationPlan.
 * No-ops entirely (zero statements) when `plan.isEmpty`.
 *
 * Caller MUST hold BOTH the Venture/Run serialization lock (so no
 * concurrent write to this Branch races this one) AND `SEED_LOCK_KEY` in
 * shared mode — see planBranchReconciliation's doc comment for why the
 * read side only needs the latter.
 *
 * ## Lock order (deadlock avoidance)
 *
 * Run paths (getOrCreateProgramRun, and this function's own callers)
 * always acquire: Venture row lock -> SEED_LOCK_KEY (shared). seed/freeze
 * always acquire SEED_LOCK_KEY (exclusive) and never take a Venture lock
 * afterward. Reversing either order risks the classic deadlock: a Run
 * path holding the Venture lock and waiting on SEED_LOCK_KEY, while
 * seed/freeze holds SEED_LOCK_KEY and waits on the Venture lock. Nothing
 * in this module ever acquires a Venture lock — only this function's
 * *caller* does, before invoking it — so keep it that way.
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
    await client.query(`update program_run_modules set sequence_index = $1 where id = $2`, [
      row.finalSequenceIndex,
      row.id,
    ]);
  }

  for (const row of plan.titleUpdates) {
    await client.query(
      `update program_run_modules set title_snapshot = $1, updated_at = now() where id = $2`,
      [row.title, row.id],
    );
  }

  if (plan.promotions.length > 0) {
    // `and status = 'locked'` guards against a stale decision: the plan
    // was computed by an earlier, separate SELECT (planBranchReconciliation),
    // not under a `for update` lock on these specific rows — unlike
    // completion.ts's unlockNextModule, which re-verifies status='locked'
    // immediately before its own write, under a row lock, in the same
    // transaction. Between this plan and this apply, a concurrent Founder
    // completion could have already moved one of these rows off 'locked'
    // (e.g. straight to 'available' via that same unlockNextModule). The
    // guard turns a would-be stale overwrite into a correct no-op instead
    // of clobbering forward progress back to 'available'.
    await client.query(
      `update program_run_modules
       set status = 'available', unlocked_at = now(), updated_at = now()
       where id = any($1::uuid[]) and status = 'locked'`,
      [plan.promotions],
    );
  }

  if (plan.missing.length > 0) {
    // workspace_id/program_run_id are the Branch's own — looked up once
    // here rather than threaded through the plan, so plans stay cheap,
    // JSON-serializable data with no caller-specific fields baked in
    // (every caller — getOrCreateProgramRun, the batch CLI — can produce
    // a plan the exact same way).
    const branchResult = await client.query<{ workspace_id: string; program_run_id: string }>(
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

function emptyRunReconciliationSummary(skippedFrozen: boolean): RunReconciliationSummary {
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
 * L2 — reconciles every 'open' Branch of ONE Program Run. Requires
 * `client` to already be inside a transaction that holds BOTH the
 * Venture/Run serialization lock and `SEED_LOCK_KEY` (shared) — this
 * function issues no lock acquisition, no BEGIN/COMMIT of its own, and
 * must never be called any other way; see applyBranchReconciliation's
 * lock-order doc comment for why.
 *
 * Only 'open' Branches: 'archived' ones are dead and 'completed' ones
 * would need to be un-completed to grow a new Module, which is out of
 * scope here — in practice there is only ever one Branch per Run today
 * (no fork feature is live yet), so this covers the real case; the
 * per-Branch loop exists so this stays correct once forking ships.
 */
export async function reconcileProgramRunInTransaction(
  client: PoolClient,
  params: { programRunId: string; programVersionId: string },
): Promise<RunReconciliationSummary> {
  // Checked once here rather than relying solely on each Branch's own
  // planBranchReconciliation check — content_lock is a program_version-level
  // property, so every Branch of this Run would get the identical answer;
  // this short-circuits N redundant SELECTs into 1 for the common case.
  // planBranchReconciliation still re-checks on its own, so calling it
  // directly (bypassing this function) stays correct too.
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
 * L3 — standalone convenience wrapper around reconcileProgramRunInTransaction:
 * owns its own transaction, Venture lock, and shared SEED_LOCK acquisition.
 * For callers that are NOT already inside a transaction holding those locks
 * — today, only the `db:reconcile-runs` batch CLI (see
 * content-seed/reconcile-runs-cli.ts). `getOrCreateProgramRun` is already
 * inside such a transaction and must call reconcileProgramRunInTransaction
 * (L2) directly instead — calling this L3 wrapper from there would attempt
 * a nested transaction and double-acquire the Venture lock this same
 * transaction already holds.
 *
 * Lock order: Venture row lock, THEN SEED_LOCK_KEY (shared) — matching
 * getOrCreateProgramRun's own order, so this can never deadlock against it
 * or against a concurrent `pnpm db:seed`/`pnpm db:freeze` (which acquire
 * SEED_LOCK_KEY exclusively and never take a Venture lock at all).
 */
export async function reconcileProgramRun(programRunId: string): Promise<RunReconciliationSummary> {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const runResult = await client.query<{
      id: string;
      venture_id: string;
      program_version_id: string;
    }>(`select id, venture_id, program_version_id from program_runs where id = $1`, [programRunId]);
    const run = runResult.rows[0];
    if (!run) {
      throw new ServiceError("NOT_FOUND", `Program Run ${programRunId} not found.`);
    }

    await client.query(`select id from ventures where id = $1 for update`, [run.venture_id]);
    await client.query("select pg_advisory_xact_lock_shared($1)", [SEED_LOCK_KEY]);

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
