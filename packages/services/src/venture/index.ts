import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type {
  Venture,
  VentureLifecycleStage,
  VentureStatus,
} from "@ai-catalyst/shared";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import {
  resolveFounderWorkspace,
  resolveFounderWorkspaceId,
} from "@ai-catalyst/services/workspace";
import { slugifyBase } from "@ai-catalyst/services/internal/slug";
import { assertWorkspaceActive } from "@ai-catalyst/services/internal/workspace";
import { parseEntityIdOrNotFound } from "@ai-catalyst/services/internal/entity-id";

const NAME_MAX_LENGTH = 200;
const ONE_LINER_MAX_LENGTH = 300;
const SUMMARY_MAX_LENGTH = 5000;
const MAX_VENTURE_SLUG_ATTEMPTS = 3; // initial attempt + up to 2 retries

// Explicit column list (never `select *`) mapped through mapVentureRow —
// a future internal-only column added to `ventures` is never accidentally
// exposed through the DTO just because a query forgot to name its columns.
const VENTURE_COLUMNS = `
  id, workspace_id, name, slug, one_liner, summary,
  lifecycle_stage, status, created_at, updated_at, archived_at
`;

interface VentureRow {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  one_liner: string | null;
  summary: string | null;
  lifecycle_stage: VentureLifecycleStage;
  status: VentureStatus;
  created_at: Date;
  updated_at: Date;
  archived_at: Date | null;
}

function mapVentureRow(row: VentureRow): Venture {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    slug: row.slug,
    oneLiner: row.one_liner,
    summary: row.summary,
    lifecycleStage: row.lifecycle_stage,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    archivedAt: row.archived_at?.toISOString() ?? null,
  };
}

interface NormalizedVentureInput {
  name: string;
  oneLiner: string | null;
  summary: string | null;
}

// "" or all-whitespace normalizes to null — never store both "" and null as
// two spellings of "no content".
function normalizeOptionalText(
  value: unknown,
  maxLength: number,
  label: string,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new ServiceError("VALIDATION_ERROR", `${label} must be a string.`);
  }

  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      `${label} must be at most ${maxLength} characters.`,
    );
  }

  return trimmed.length > 0 ? trimmed : null;
}

// Runtime validation of untrusted input crossing the API boundary — the
// caller's declared parameter type only describes the happy path.
function normalizeCreateVentureInput(input: unknown): NormalizedVentureInput {
  if (typeof input !== "object" || input === null || !("name" in input)) {
    throw new ServiceError("VALIDATION_ERROR", "Name is required.");
  }

  const { name, oneLiner, summary } = input as {
    name: unknown;
    oneLiner?: unknown;
    summary?: unknown;
  };

  if (typeof name !== "string") {
    throw new ServiceError("VALIDATION_ERROR", "Name must be a string.");
  }

  const trimmedName = name.trim();
  if (trimmedName.length === 0 || trimmedName.length > NAME_MAX_LENGTH) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      `Name must be a non-blank string of at most ${NAME_MAX_LENGTH} characters.`,
    );
  }

  return {
    name: trimmedName,
    oneLiner: normalizeOptionalText(oneLiner, ONE_LINER_MAX_LENGTH, "One-liner"),
    summary: normalizeOptionalText(summary, SUMMARY_MAX_LENGTH, "Summary"),
  };
}

export interface CreateVentureDependencies {
  // Test-only seam: production always uses randomBytes(3).toString("hex").
  // Deterministic sequences let tests force a real slug collision instead
  // of relying on random-collision odds.
  createSlugSuffix?: () => string;
}

// `ventures_workspace_slug_unique` is a plain (workspace-scoped) unique
// constraint, so `on conflict (workspace_id, slug) do nothing` never aborts
// the transaction the way a raised 23505 would — a slug collision here
// just returns zero rows and this loop tries again with a fresh suffix,
// all on the same client/transaction that already holds the Workspace
// lookup above. (Unlike a try/catch on a raised 23505, which would leave
// the transaction aborted and unable to retry without a full rollback —
// incompatible with keeping the Workspace-active check and the insert in
// one transaction.) Any *other* unique violation on `ventures` is not
// targeted by this ON CONFLICT clause and would raise normally.
async function insertVentureWithRetry(
  client: PoolClient,
  workspaceId: string,
  createdByUserId: string,
  input: NormalizedVentureInput,
  createSuffix: () => string,
): Promise<VentureRow> {
  const base = slugifyBase(input.name, "venture");

  for (let attempt = 0; attempt < MAX_VENTURE_SLUG_ATTEMPTS; attempt++) {
    const slug = `${base}-${createSuffix()}`;
    const result = await client.query<VentureRow>(
      `insert into ventures (workspace_id, created_by_user_id, name, slug, one_liner, summary)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (workspace_id, slug) do nothing
       returning ${VENTURE_COLUMNS}`,
      [
        workspaceId,
        createdByUserId,
        input.name,
        slug,
        input.oneLiner,
        input.summary,
      ],
    );
    if (result.rows[0]) {
      return result.rows[0];
    }
  }

  throw new Error(
    "Exhausted venture slug retry attempts — this indicates a broken " +
      "suffix generator, not normal random-collision odds.",
  );
}

export async function createVenture(
  actor: ActorContext,
  input: unknown,
  deps: CreateVentureDependencies = {},
): Promise<Venture> {
  assertRole(actor, ["founder"]);
  const normalized = normalizeCreateVentureInput(input);
  const createSuffix =
    deps.createSlugSuffix ?? (() => randomBytes(3).toString("hex"));

  const client = await pool.connect();
  try {
    await client.query("begin");

    // Resolved on the same client as the insert below, so the Workspace
    // cannot be suspended by a concurrent transaction between this check
    // and the write.
    const workspace = await resolveFounderWorkspace(actor, client);
    assertWorkspaceActive(workspace.status);

    const row = await insertVentureWithRetry(
      client,
      workspace.id,
      actor.userId,
      normalized,
      createSuffix,
    );

    await client.query("commit");
    return mapVentureRow(row);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

// Newest first, with a stable id tie-break so rows created within the same
// timestamp (common in fast test runs) never produce a flaky order.
export async function listVentures(actor: ActorContext): Promise<Venture[]> {
  assertRole(actor, ["founder"]);
  const workspaceId = await resolveFounderWorkspaceId(actor);

  const result = await pool.query<VentureRow>(
    `select ${VENTURE_COLUMNS} from ventures
     where workspace_id = $1
     order by created_at desc, id desc`,
    [workspaceId],
  );

  return result.rows.map(mapVentureRow);
}

export async function getVenture(
  actor: ActorContext,
  ventureId: string,
): Promise<Venture> {
  assertRole(actor, ["founder"]);
  const id = parseEntityIdOrNotFound(ventureId, "Venture not found.");
  const workspaceId = await resolveFounderWorkspaceId(actor);

  // Scoped by workspace_id, not just id — a Venture belonging to another
  // Workspace is indistinguishable from one that doesn't exist at all.
  const result = await pool.query<VentureRow>(
    `select ${VENTURE_COLUMNS} from ventures
     where id = $1 and workspace_id = $2`,
    [id, workspaceId],
  );

  const row = result.rows[0];
  if (!row) {
    throw new ServiceError("NOT_FOUND", "Venture not found.");
  }

  return mapVentureRow(row);
}

export async function archiveVenture(
  actor: ActorContext,
  ventureId: string,
): Promise<Venture> {
  assertRole(actor, ["founder"]);
  const id = parseEntityIdOrNotFound(ventureId, "Venture not found.");

  const client = await pool.connect();
  try {
    await client.query("begin");

    const workspace = await resolveFounderWorkspace(actor, client);
    assertWorkspaceActive(workspace.status);

    const lockResult = await client.query<VentureRow>(
      `select ${VENTURE_COLUMNS} from ventures
       where id = $1 and workspace_id = $2
       for update`,
      [id, workspace.id],
    );
    const row = lockResult.rows[0];
    if (!row) {
      throw new ServiceError("NOT_FOUND", "Venture not found.");
    }

    // Idempotent: archiving an already-archived Venture is a no-op, not an
    // error — and deliberately does not touch `archived_at` a second time.
    if (row.status === "archived") {
      await client.query("commit");
      return mapVentureRow(row);
    }

    const archivedResult = await client.query<VentureRow>(
      `update ventures
       set status = 'archived', archived_at = now()
       where id = $1 and workspace_id = $2
       returning ${VENTURE_COLUMNS}`,
      [id, workspace.id],
    );

    // Clears the default selection for *every* user currently pointed at
    // this Venture — scoped by workspace_id + venture_id, not by the
    // acting Founder's user_id. Today that is only ever the Founder, but
    // from PR 4.1 onward it also covers any Mentor whose active_venture_id
    // happened to point here, so this never needs revisiting later.
    await client.query(
      `update user_active_contexts
       set active_venture_id = null, updated_at = now()
       where active_workspace_id = $1 and active_venture_id = $2`,
      [workspace.id, id],
    );

    await client.query("commit");
    return mapVentureRow(archivedResult.rows[0]);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
