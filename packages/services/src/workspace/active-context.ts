import type { PoolClient } from "pg";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type { ActiveContext } from "@ai-catalyst/shared";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import { resolveFounderWorkspaceId } from "@ai-catalyst/services/workspace";
import { parseEntityIdOrNotFound } from "@ai-catalyst/services/internal/entity-id";
import { withTransaction } from "@ai-catalyst/services/internal/transaction";
import { ensureAndReadActiveContext } from "@ai-catalyst/services/workspace/internal/active-context-upsert";

interface ActiveContextRow {
  active_workspace_id: string | null;
  active_venture_id: string | null;
}

// UI selection only — never a basis for authorization. Write paths must re-check ownership.
export async function getActiveContext(
  actor: ActorContext,
): Promise<ActiveContext> {
  assertRole(actor, ["founder"]);
  const workspaceId = await resolveFounderWorkspaceId(actor);

  // Read-only fast path — this is called on every page render, and the
  // overwhelming majority of calls are steady-state (row exists, already
  // points at the current workspace). Only fall through to the write path
  // (which self-heals a missing or stale row) when this read can't prove
  // the row is already correct.
  const fast = await pool.query<ActiveContextRow>(
    `select active_workspace_id, active_venture_id
     from user_active_contexts
     where user_id = $1`,
    [actor.userId],
  );
  const fastRow = fast.rows[0];
  if (fastRow && fastRow.active_workspace_id === workspaceId) {
    return {
      workspaceId: fastRow.active_workspace_id,
      ventureId: fastRow.active_venture_id,
    };
  }

  return withTransaction((client) =>
    ensureAndReadActiveContext(client, actor.userId, workspaceId),
  );
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

  return withTransaction(async (client) => {
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

    return { workspaceId, ventureId: targetVentureId };
  });
}
