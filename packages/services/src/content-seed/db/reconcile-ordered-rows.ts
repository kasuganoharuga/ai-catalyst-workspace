import type { PoolClient } from "pg";

import { ContentSeedError } from "../errors.js";

// Postgres sequence_index is plain integer (0001 schema).
const MAX_SEQUENCE_VALUE = 2_147_483_647;

// Gap past max sequence for temporary shift values — debugging clarity only, not load-bearing.
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
  /** Keys falling out of desired — caller archives (module_definitions may cascade children). */
  toArchive: ExistingOrderedRow[];
  /** Archived keys back in desired — revived in place. */
  toRevive: Array<{ id: string; key: string; finalSequenceIndex: number }>;
  /** Non-archived rows whose sequence_index is changing. */
  resequenceStaying: Array<{ id: string; finalSequenceIndex: number }>;
  /** Desired keys with no row yet — caller INSERTs after applying this plan. */
  missingKeys: string[];
  /** Temporary shift offset — clears resequenceStaying under the partial unique index. */
  offset: number;
  /** False when desired already matches current non-archived rows — caller must no-op all writes. */
  changed: boolean;
}

/**
 * Pure plan for archive/revive/resequence against partial unique (scope, sequence_index).
 * Caller applies steps 5–6 (final resequence + INSERT) — column payloads are table-specific.
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

// Table/key/scope names are closed literals — safe to interpolate here only.
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

/** Applies planOrderedRows; no-ops when unchanged. Revive status: draft for modules, active for questions/artifacts. */
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
