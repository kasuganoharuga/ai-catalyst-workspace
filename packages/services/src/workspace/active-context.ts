import type { PoolClient } from "pg";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type { ActiveContext } from "@ai-catalyst/shared";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import { resolveFounderWorkspaceId } from "@ai-catalyst/services/workspace";
import { parseEntityIdOrNotFound } from "@ai-catalyst/services/internal/entity-id";

interface ActiveContextRow {
  active_workspace_id: string | null;
  active_venture_id: string | null;
}

// UI selection only — never a basis for authorization. Write paths must re-check ownership.
//
// Three statements, not one upsert — unconditional upsert would bump updated_at on every read.
export async function getActiveContext(
  actor: ActorContext,
): Promise<ActiveContext> {
  assertRole(actor, ["founder"]);
  const workspaceId = await resolveFounderWorkspaceId(actor);

  const client = await pool.connect();
  try {
    await client.query("begin");

    await client.query(
      `insert into user_active_contexts (user_id, active_workspace_id, active_venture_id)
       values ($1, $2, null)
       on conflict (user_id) do nothing`,
      [actor.userId, workspaceId],
    );

    // Correct stale workspace only — leave correct rows (and updated_at) untouched.
    await client.query(
      `update user_active_contexts
       set active_workspace_id = $2, active_venture_id = null, updated_at = now()
       where user_id = $1
         and active_workspace_id is distinct from $2`,
      [actor.userId, workspaceId],
    );

    const result = await client.query<ActiveContextRow>(
      `select active_workspace_id, active_venture_id
       from user_active_contexts
       where user_id = $1`,
      [actor.userId],
    );

    await client.query("commit");

    const row = result.rows[0];
    return {
      workspaceId: row?.active_workspace_id ?? null,
      ventureId: row?.active_venture_id ?? null,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

// Invitation-accept path only — no assertRole (caller is still 'pending'). Not for ordinary switches.
export async function setInitialActiveContext(
  client: PoolClient,
  userId: string,
  workspaceId: string,
  ventureId: string,
): Promise<void> {
  await client.query(
    `insert into user_active_contexts (user_id, active_workspace_id, active_venture_id)
     values ($1, $2, $3)
     on conflict (user_id) do update set
       active_workspace_id = excluded.active_workspace_id,
       active_venture_id = excluded.active_venture_id,
       updated_at = now()`,
    [userId, workspaceId, ventureId],
  );
}

// Switch or clear (ventureId: null) the UI selection. Archived Ventures allowed for read-only browsing.
export async function setActiveVenture(
  actor: ActorContext,
  ventureId: string | null,
): Promise<ActiveContext> {
  assertRole(actor, ["founder"]);

  const client = await pool.connect();
  try {
    await client.query("begin");

    const workspaceId = await resolveFounderWorkspaceId(actor, client);

    let targetVentureId: string | null = null;
    if (ventureId !== null) {
      targetVentureId = parseEntityIdOrNotFound(
        ventureId,
        "Venture not found.",
      );

      const ventureResult = await client.query<{ id: string }>(
        `select id from ventures where id = $1 and workspace_id = $2`,
        [targetVentureId, workspaceId],
      );
      if (!ventureResult.rows[0]) {
        throw new ServiceError("NOT_FOUND", "Venture not found.");
      }
    }

    await client.query(
      `insert into user_active_contexts (user_id, active_workspace_id, active_venture_id)
       values ($1, $2, $3)
       on conflict (user_id) do update set
         active_workspace_id = excluded.active_workspace_id,
         active_venture_id = excluded.active_venture_id,
         updated_at = now()`,
      [actor.userId, workspaceId, targetVentureId],
    );

    await client.query("commit");

    return { workspaceId, ventureId: targetVentureId };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
