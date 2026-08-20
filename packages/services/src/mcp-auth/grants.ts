import { pool } from "@ai-catalyst/db";

import { upsertPreferredAiProvider } from "@ai-catalyst/services/profile/internal/preferred-ai-provider";
import { GRANTED_MCP_SCOPES } from "@ai-catalyst/services/mcp-auth/types";
import {
  mcpProviderForRedirectUris,
  parseRedirectUrls,
} from "@ai-catalyst/services/mcp-auth/provider";

// --- Grant issuance ---

/**
 * Records a new connection after authorization_code exchange only — not refresh.
 * Evicts other clients (one-at-a-time); deferred from /mcp/authorize so abandoned
 * consent does not tear down a working connection. Silent when token unknown.
 */
export async function recordMcpGrantIssued(params: {
  accessToken: string;
}): Promise<void> {
  const { accessToken } = params;
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("begin");

    const owner = await client.query<{
      user_id: string;
      client_id: string;
      redirect_urls: string | null;
    }>(
      `select t.user_id, t.client_id, a.redirect_urls
       from mcp_oauth_access_tokens t
       join mcp_oauth_applications a on a.client_id = t.client_id
       where t.access_token = $1
       for update of t`,
      [accessToken],
    );
    const row = owner.rows[0];
    if (!row?.user_id) {
      await client.query("rollback");
      return;
    }

    const evicted = await client.query<{ client_id: string }>(
      `delete from mcp_oauth_access_tokens
       where user_id = $1 and client_id <> $2
       returning client_id`,
      [row.user_id, row.client_id],
    );

    const evictedClientIds = [
      ...new Set(evicted.rows.map((evictedRow) => evictedRow.client_id)),
    ];
    for (const evictedClientId of evictedClientIds) {
      await client.query(
        `insert into mcp_oauth_consents (client_id, user_id, scopes, consent_given)
         values ($1, $2, $3, false)`,
        [evictedClientId, row.user_id, GRANTED_MCP_SCOPES.join(" ")],
      );
    }

    await client.query(
      `delete from mcp_oauth_grants where user_id = $1 and client_id <> $2`,
      [row.user_id, row.client_id],
    );

    // Same client re-auth restarts the 90-day cap.
    await client.query(
      `insert into mcp_oauth_grants (user_id, client_id, granted_at)
       values ($1, $2, now())
       on conflict (user_id, client_id) do update set granted_at = now()`,
      [row.user_id, row.client_id],
    );

    const connectedProvider = mcpProviderForRedirectUris(
      parseRedirectUrls(row.redirect_urls),
    );
    if (connectedProvider !== "other") {
      // Same transaction as grant eviction — uses passed client, not pool.
      await upsertPreferredAiProvider(client, row.user_id, connectedProvider);
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
