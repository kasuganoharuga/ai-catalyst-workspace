import type { Pool, PoolClient } from "pg";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type { WorkspaceStatus, WorkspaceSummary } from "@ai-catalyst/shared";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";

// pg's Pool and PoolClient share the same .query() call signature — accepting
// either lets a write path (Venture create/archive) run this same lookup
// inside its own already-open transaction instead of opening a second,
// unsynchronized connection. Whichever is passed in is never closed here;
// the caller owns its lifecycle.
export type QueryExecutor = Pool | PoolClient;

interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  status: WorkspaceStatus;
}

function mapWorkspace(row: WorkspaceRow): WorkspaceSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
  };
}

// Every Workspace has exactly one Founder (workspaces_founder_unique), so
// this is always a single-row lookup. Defensive NOT_FOUND: every Founder
// gets a Workspace as part of accepting their invitation, so a missing row
// here means something upstream is broken, not a normal business state.
export async function resolveFounderWorkspace(
  actor: ActorContext,
  executor: QueryExecutor = pool,
): Promise<{ id: string; status: WorkspaceStatus }> {
  assertRole(actor, ["founder"]);

  const result = await executor.query<{ id: string; status: WorkspaceStatus }>(
    `select id, status from workspaces where founder_user_id = $1`,
    [actor.userId],
  );

  const row = result.rows[0];
  if (!row) {
    throw new ServiceError("NOT_FOUND", "Workspace not found.");
  }

  return row;
}

export async function resolveFounderWorkspaceId(
  actor: ActorContext,
  executor: QueryExecutor = pool,
): Promise<string> {
  return (await resolveFounderWorkspace(actor, executor)).id;
}

// Read path for the Workspace page — always uses the default pool
// executor since nothing else needs it inside a transaction.
export async function getMyWorkspace(
  actor: ActorContext,
): Promise<WorkspaceSummary> {
  assertRole(actor, ["founder"]);

  const result = await pool.query<WorkspaceRow>(
    `select id, name, slug, status from workspaces where founder_user_id = $1`,
    [actor.userId],
  );

  const row = result.rows[0];
  if (!row) {
    throw new ServiceError("NOT_FOUND", "Workspace not found.");
  }

  return mapWorkspace(row);
}
