import type { PoolClient } from "pg";

import type { ActiveContext } from "@ai-catalyst/shared";

interface ActiveContextRow {
  active_workspace_id: string | null;
  active_venture_id: string | null;
}

// Three statements, not one upsert — unconditional upsert would bump
// updated_at on every read. Runs on the caller's own client so it can be
// composed inside an already-open transaction (e.g. updateMyCompanyProfile's
// first-save path) instead of opening a second, unsynchronized connection.
export async function ensureAndReadActiveContext(
  client: PoolClient,
  userId: string,
  workspaceId: string,
): Promise<ActiveContext> {
  await client.query(
    `insert into user_active_contexts (user_id, active_workspace_id, active_venture_id)
     values ($1, $2, null)
     on conflict (user_id) do nothing`,
    [userId, workspaceId],
  );

  // Correct stale workspace only — leave correct rows (and updated_at) untouched.
  await client.query(
    `update user_active_contexts
     set active_workspace_id = $2, active_venture_id = null, updated_at = now()
     where user_id = $1
       and active_workspace_id is distinct from $2`,
    [userId, workspaceId],
  );

  const result = await client.query<ActiveContextRow>(
    `select active_workspace_id, active_venture_id
     from user_active_contexts
     where user_id = $1`,
    [userId],
  );

  const row = result.rows[0];
  return {
    workspaceId: row?.active_workspace_id ?? null,
    ventureId: row?.active_venture_id ?? null,
  };
}
