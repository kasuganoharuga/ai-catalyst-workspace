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

// user_active_contexts only records the current UI selection (see the
// table's own schema comment) — never a basis for authorization. Every
// write path that actually mutates a Venture/Workspace must independently
// re-check ownership and status; this module never asserts either.
//
// Deliberately three separate statements instead of a single
// `on conflict (user_id) do update` — an unconditional upsert would rewrite
// (and bump `updated_at` on) every plain read, including the common case
// where nothing is actually wrong. The middle `update` only fires when the
// stored Workspace has drifted from the Founder's real one.
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

    // Only corrects a row whose stored Workspace no longer matches the
    // Founder's real one (e.g. seeded/stale test data) — clears the
    // now-incompatible Venture selection in the same statement. A row that
    // is already correct is left completely untouched, including its
    // `updated_at`.
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

// Single function for both switching and explicitly clearing
// (ventureId: null) the current selection — reused as-is by PR 4.1's
// Mentor workspace-switching and any future MCP tool. Selecting an
// *archived* Venture is allowed (read-only history browsing); the DB-level
// backstop is the composite FK user_active_contexts_venture_fk
// (active_venture_id, active_workspace_id) -> ventures(id, workspace_id).
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
