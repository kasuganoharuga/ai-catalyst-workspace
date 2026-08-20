import { pool } from "@ai-catalyst/db";
import type {
  ActorContext,
  McpProvider,
} from "@ai-catalyst/contracts/actor-context";

import { assertRole } from "@ai-catalyst/services/errors";
import {
  GRANTED_MCP_SCOPES,
  MCP_GRANT_ABSOLUTE_MAX_AGE_MS,
  MCP_GRANT_IDLE_TIMEOUT_MS,
} from "@ai-catalyst/services/mcp-auth/types";
import {
  mcpProviderForRedirectUris,
  parseRedirectUrls,
} from "@ai-catalyst/services/mcp-auth/provider";

// --- Connection status ---

/**
 * Two facts deliberately kept separate: `authorised` is our DB state;
 * `lastActivityAt` is the only evidence of client liveness (stateless MCP
 * has no session or disconnect signal).
 */
export interface McpConnectionStatus {
  // Usable token row exists; expired access + valid refresh still counts.
  authorised: boolean;
  clientName: string | null;
  // OAuth client_id — disambiguates duplicate DCR display names.
  clientId: string | null;
  // From mcp_oauth_grants.granted_at, not token created_at (rotation replaces hourly).
  authorisedAt: string | null;
  // Soonest of refresh expiry, absolute cap, and idle deadline.
  expiresAt: string | null;
  // True after any Accept, even post-expiry — "reconnect" vs "never set up".
  hasEverAuthorised: boolean;
  // null = never exercised; distinct from authorised (redirect can finish without a tool call).
  lastActivityAt: string | null;
  // From registered redirect hosts, not client_name (DCR is unauthenticated).
  provider: McpProvider | null;
}

interface ConnectionTokenRow {
  client_name: string;
  client_id: string;
  created_at: Date;
  granted_at: Date | null;
  refresh_token_expires_at: Date;
  redirect_urls: string | null;
}

/** Read-only summary for the Connection page; never returns token material. */
export async function getMcpConnectionStatus(
  actor: ActorContext,
): Promise<McpConnectionStatus> {
  assertRole(actor, ["founder"]);

  // Either half still good; limit 1 is correct while one-connection-at-a-time holds.
  const tokenResult = await pool.query<ConnectionTokenRow>(
    `select a.name as client_name,
            a.redirect_urls,
            t.client_id,
            t.created_at,
            g.granted_at,
            t.refresh_token_expires_at
     from mcp_oauth_access_tokens t
     join mcp_oauth_applications a on a.client_id = t.client_id
     left join mcp_oauth_grants g
       on g.user_id = t.user_id and g.client_id = t.client_id
     where t.user_id = $1
       and (t.access_token_expires_at > now() or t.refresh_token_expires_at > now())
       and not a.disabled
       and a.type = 'public'
       and (a.client_secret is null or a.client_secret = '')
     order by t.created_at desc
     limit 1`,
    [actor.userId],
  );
  const token = tokenResult.rows[0] ?? null;

  const consentResult = await pool.query<{ exists: boolean }>(
    `select exists (
       select 1 from mcp_oauth_consents
       where user_id = $1 and consent_given
     ) as exists`,
    [actor.userId],
  );

  // One row per tool call (including denied); idx_mcp_tool_audit_logs_user_time.
  const activityResult = await pool.query<{ last_activity_at: Date | null }>(
    `select max(created_at) as last_activity_at
     from mcp_tool_audit_logs
     where user_id = $1`,
    [actor.userId],
  );

  const lastActivityAt = activityResult.rows[0]?.last_activity_at ?? null;

  // Fallback for grants predating 0008; backfilled on next refresh.
  const grantedAt = token ? (token.granted_at ?? token.created_at) : null;

  const deadline =
    token && grantedAt
      ? connectionDeadline(
          token.refresh_token_expires_at,
          grantedAt,
          lastActivityAt,
        )
      : null;

  // Idle rows can outlive deadline until next refresh; hide stale "connected until" dates.
  const live = deadline !== null && deadline.getTime() > Date.now();

  return {
    authorised: live,
    clientName: live ? (token?.client_name ?? null) : null,
    clientId: live ? (token?.client_id ?? null) : null,
    authorisedAt: live ? (grantedAt?.toISOString() ?? null) : null,
    expiresAt: live ? (deadline?.toISOString() ?? null) : null,
    hasEverAuthorised: consentResult.rows[0]?.exists ?? false,
    lastActivityAt: lastActivityAt?.toISOString() ?? null,
    provider:
      live && token
        ? mcpProviderForRedirectUris(parseRedirectUrls(token.redirect_urls))
        : null,
  };
}

/**
 * Name of the assistant a new Accept would disconnect, or null. Warns on the
 * consent screen before recordMcpGrantIssued enforces one-connection-at-a-time.
 * Raw userId — consent runs before role is narrowed to founder.
 */
export async function getMcpConnectionToBeReplaced(
  userId: string,
  incomingClientId: string,
): Promise<string | null> {
  const result = await pool.query<{ client_name: string }>(
    `select a.name as client_name
     from mcp_oauth_access_tokens t
     join mcp_oauth_applications a on a.client_id = t.client_id
     where t.user_id = $1
       and t.client_id <> $2
       and (t.access_token_expires_at > now() or t.refresh_token_expires_at > now())
       and not a.disabled
       and a.type = 'public'
       and (a.client_secret is null or a.client_secret = '')
     order by t.created_at desc
     limit 1`,
    [userId, incomingClientId],
  );
  return result.rows[0]?.client_name ?? null;
}

/** Soonest of refresh expiry, absolute cap, and idle deadline (matches checkRefreshTokenIsRedeemable). */
function connectionDeadline(
  refreshTokenExpiresAt: Date,
  grantedAt: Date,
  lastActivityAt: Date | null,
): Date {
  const idleDeadline =
    (lastActivityAt ?? grantedAt).getTime() + MCP_GRANT_IDLE_TIMEOUT_MS;
  const absoluteDeadline = grantedAt.getTime() + MCP_GRANT_ABSOLUTE_MAX_AGE_MS;

  return new Date(
    Math.min(refreshTokenExpiresAt.getTime(), idleDeadline, absoluteDeadline),
  );
}

// --- Revocation ---

export interface McpRevocationResult {
  /** Zero is normal — idempotent revoke. */
  accessTokensRevoked: number;
}

/** Revokes every MCP token for the signed-in Founder. Idempotent. */
export async function revokeMcpConnectionForUser(
  actor: ActorContext,
): Promise<McpRevocationResult> {
  assertRole(actor, ["founder"]);
  return revokeAllMcpConnectionsForUserId(actor.userId);
}

/**
 * Same revocation without role gate — for account-level hooks (e.g. password
 * change) that have userId but no ActorContext.
 */
export async function revokeAllMcpConnectionsForUserId(
  userId: string,
): Promise<McpRevocationResult> {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const deleted = await client.query<{ client_id: string }>(
      `delete from mcp_oauth_access_tokens
       where user_id = $1
       returning client_id`,
      [userId],
    );

    // Withdrawal history per client — not a live gate.
    const clientIds = [...new Set(deleted.rows.map((row) => row.client_id))];
    for (const clientId of clientIds) {
      await client.query(
        `insert into mcp_oauth_consents (client_id, user_id, scopes, consent_given)
         values ($1, $2, $3, false)`,
        [clientId, userId, GRANTED_MCP_SCOPES.join(" ")],
      );
    }

    // Drop grant so reconnection does not inherit a part-spent 90-day cap.
    await client.query(`delete from mcp_oauth_grants where user_id = $1`, [
      userId,
    ]);

    await client.query("commit");
    return { accessTokensRevoked: deleted.rowCount ?? 0 };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * RFC 7009 revocation — always succeeds silently (no token probing).
 * Matches access or refresh column; V1 is public clients only.
 */
export async function revokeMcpAccessToken(token: string): Promise<void> {
  if (typeof token !== "string" || token.trim().length === 0) {
    return;
  }
  await pool.query(
    `delete from mcp_oauth_access_tokens
     where access_token = $1 or refresh_token = $1`,
    [token],
  );
}
