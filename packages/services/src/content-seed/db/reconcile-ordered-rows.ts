import type { PoolClient } from "pg";

import { ContentSeedError } from "../errors.js";

// Postgres `sequence_index` columns are plain `integer` (see 0001's
// module_definitions/module_questions/artifact_definitions).
const MAX_SEQUENCE_VALUE = 2_147_483_647;

// How far past the highest sequence_index actually in play (existing or
// desired) the temporary shift range starts. Not load-bearing for
// correctness — any positive gap works, since the shift only needs to
// clear every currently-non-archived row out of every *desired* final
// sequence_index, which max(currentMax, desiredMax) already guarantees on
// its own. The gap just keeps the temporary values visually distinct in
// ad-hoc `select ... order by sequence_index` debugging.
const SAFE_GAP = 1000;

export type OrderedRowsTable =
  "module_definitions" | "module_questions" | "artifact_definitions";
type OrderedRowsKeyColumn = "module_key" | "question_key" | "artifact_key";
type OrderedRowsScopeColumn = "program_version_id" | "module_definition_id";

export interface ExistingOrderedRow {
  id: string;
  key: string;
  sequenceIndex: number;
  archived: boolean;
}

export interface DesiredOrderedRow {
  key: string;
  sequenceIndex: number;
}

export interface OrderedRowsPlan {
  /** Existing, currently non-archived rows whose key fell out of `desired` — the caller must archive these (and, for module_definitions, cascade-archive their children — see db/modules.ts). */
  toArchive: ExistingOrderedRow[];
  /** Existing, currently archived rows whose key is back in `desired` — revived in place, same id. */
  toRevive: Array<{ id: string; key: string; finalSequenceIndex: number }>;
  /** Existing, currently non-archived rows staying non-archived, whose sequence_index is actually changing. */
  resequenceStaying: Array<{ id: string; finalSequenceIndex: number }>;
  /** Desired keys with no existing row at all (any status) — the caller must INSERT these after applying this plan; by then their sequence_index is guaranteed unoccupied. */
  missingKeys: string[];
  /** Temporary range offset used to clear `resequenceStaying` rows out of the way — see planOrderedRows' doc comment for why this makes the whole sequence collision-free under a non-deferrable partial unique index. */
  offset: number;
  /** False iff `desired` is already exactly what `current`'s non-archived rows describe — no UPDATE/INSERT of any kind is needed. Callers must treat this as "no-op", not run any write, so re-seeding unchanged content never bumps updated_at (see content-seed/index.db.test.ts's "running it twice is a no-op that changes no ids or timestamps"). */
  changed: boolean;
}

/**
 * Computes what archiving, reviving, and resequencing `desired` requires
 * against `current`, WITHOUT touching the database — pure and unit-testable
 * on its own, and reused by the freeze preflight (which needs to know
 * whether a plan is empty without ever writing anything; see
 * content-seed/db/freeze.ts).
 *
 * The three content-definition tables (module_definitions /
 * module_questions / artifact_definitions) all have a partial unique index
 * on (scope, sequence_index) WHERE status <> 'archived' — archived rows
 * are excluded from the uniqueness competition entirely. That is what
 * makes the following order collision-free under that non-deferrable
 * index, even though every step here is committed as its own statement:
 *
 *   1. archive rows whose key fell out of `desired`
 *      (they immediately exit the uniqueness competition)
 *   2. shift every remaining non-archived row's sequence_index by a large
 *      `offset` — chosen so no shifted value can equal any *desired*
 *      final value, so this step alone can never collide with itself
 *   3. write revived rows' final sequence_index while they are STILL
 *      archived — archived rows aren't constrained against each other or
 *      anything else, so this can never collide
 *   4. flip revived rows to non-archived — each one's sequence_index is
 *      already its unique final value, and every `staying` row is still
 *      parked in the offset range, so this can't collide either
 *   5. move `staying` rows from the offset range to their final
 *      sequence_index, one at a time — each target value is unique among
 *      desired rows and already vacated by step 1, so no collision
 *   6. INSERT missing rows at their final sequence_index — same reasoning
 *      as step 5
 *
 * Steps 5 and 6 are the caller's job, not this module's — inserting a
 * missing row also writes every other content column (title, validator
 * config, ...), which is specific to whichever of the three tables is
 * being reconciled and belongs in db/modules.ts's existing per-row upsert
 * functions, not here.
 */
export function planOrderedRows(
  current: ExistingOrderedRow[],
  desired: DesiredOrderedRow[],
): OrderedRowsPlan {
  const desiredByKey = new Map(
    desired.map((row) => [row.key, row.sequenceIndex]),
  );
  const currentByKey = new Map(current.map((row) => [row.key, row]));

  const nonArchived = current.filter((row) => !row.archived);
  const archived = current.filter((row) => row.archived);

  const toArchive = nonArchived.filter((row) => !desiredByKey.has(row.key));

  const toRevive = archived
    .filter((row) => desiredByKey.has(row.key))
    .map((row) => ({
      id: row.id,
      key: row.key,
      finalSequenceIndex: desiredByKey.get(row.key)!,
    }));

  const staying = nonArchived.filter((row) => desiredByKey.has(row.key));
  const resequenceStaying = staying
    .map((row) => ({
      id: row.id,
      currentSequenceIndex: row.sequenceIndex,
      finalSequenceIndex: desiredByKey.get(row.key)!,
    }))
    .filter((row) => row.currentSequenceIndex !== row.finalSequenceIndex)
    .map((row) => ({ id: row.id, finalSequenceIndex: row.finalSequenceIndex }));

  const missingKeys = desired
    .map((row) => row.key)
    .filter((key) => !currentByKey.has(key));

  const changed =
    toArchive.length > 0 ||
    toRevive.length > 0 ||
    resequenceStaying.length > 0 ||
    missingKeys.length > 0;

  if (!changed) {
    return {
      toArchive: [],
      toRevive: [],
      resequenceStaying: [],
      missingKeys: [],
      offset: 0,
      changed: false,
    };
  }

  const currentMaxSequence = current.reduce(
    (max, row) => Math.max(max, row.sequenceIndex),
    0,
  );
  const desiredMaxSequence = desired.reduce(
    (max, row) => Math.max(max, row.sequenceIndex),
    0,
  );
  const offset = Math.max(currentMaxSequence, desiredMaxSequence) + SAFE_GAP;

  if (currentMaxSequence + offset > MAX_SEQUENCE_VALUE) {
    throw new ContentSeedError(
      "SEQUENCE_RESEQUENCE_OVERFLOW",
      `Resequencing would push sequence_index past ${MAX_SEQUENCE_VALUE} ` +
        `(currentMax=${currentMaxSequence}, offset=${offset}). This is almost certainly a ` +
        "content-constant bug (an implausibly large sequenceIndex), not a real ordering need.",
    );
  }

  return {
    toArchive,
    toRevive,
    resequenceStaying,
    missingKeys,
    offset,
    changed,
  };
}

/**
 * Applies a plan from planOrderedRows against `table`. No-ops entirely
 * (zero statements) when `plan.changed` is false.
 *
 * `reviveStatus` is the non-archived status a revived row should land on:
 * module_definitions revives to 'draft' — its own idempotent activation
 * pass in db/publish.ts (not this function) is what may later move it to
 * 'active', exactly as it would for a brand new draft row, so a
 * previously-active module that gets archived and later revived goes
 * through the same activation gate as if it were new. module_questions
 * and artifact_definitions have no such separate activation step, so they
 * revive straight to 'active'.
 */
// Table/key/scope column names are always one of the closed literal
// unions above — never derived from user input or content-constant
// strings — so interpolating them directly into SQL here is safe. This is
// the only place in the content-seed reconciler that builds SQL with a
// dynamic identifier; every other statement (in db/modules.ts, db/prompts.ts,
// ...) spells its table name out literally.
export async function loadExistingOrderedRows(
  client: PoolClient,
  table: OrderedRowsTable,
  keyColumn: OrderedRowsKeyColumn,
  scopeColumn: OrderedRowsScopeColumn,
  scopeValue: string,
): Promise<ExistingOrderedRow[]> {
  const result = await client.query<{
    id: string;
    key: string;
    sequence_index: number;
    status: string;
  }>(
    `select id, ${keyColumn} as key, sequence_index, status from ${table} where ${scopeColumn} = $1`,
    [scopeValue],
  );
  return result.rows.map((row) => ({
    id: row.id,
    key: row.key,
    sequenceIndex: row.sequence_index,
    archived: row.status === "archived",
  }));
}

export async function applyOrderedRowsPlan(
  client: PoolClient,
  table: OrderedRowsTable,
  plan: OrderedRowsPlan,
  reviveStatus: "draft" | "active",
): Promise<void> {
  if (!plan.changed) {
    return;
  }

  if (plan.toArchive.length > 0) {
    await client.query(
      `update ${table} set status = 'archived' where id = any($1::uuid[])`,
      [plan.toArchive.map((row) => row.id)],
    );
  }

  if (plan.resequenceStaying.length > 0) {
    await client.query(
      `update ${table} set sequence_index = sequence_index + $1 where id = any($2::uuid[])`,
      [plan.offset, plan.resequenceStaying.map((row) => row.id)],
    );
  }

  for (const row of plan.toRevive) {
    await client.query(
      `update ${table} set sequence_index = $1 where id = $2`,
      [row.finalSequenceIndex, row.id],
    );
  }

  if (plan.toRevive.length > 0) {
    await client.query(
      `update ${table} set status = $1 where id = any($2::uuid[])`,
      [reviveStatus, plan.toRevive.map((row) => row.id)],
    );
  }

  for (const row of plan.resequenceStaying) {
    await client.query(
      `update ${table} set sequence_index = $1 where id = $2`,
      [row.finalSequenceIndex, row.id],
    );
  }
}
