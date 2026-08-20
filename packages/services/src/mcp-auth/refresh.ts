import { createHash } from "node:crypto";

import { pool } from "@ai-catalyst/db";

import {
  type AuthorizationCodeCheckResult,
  MCP_BEARER_TOKEN_PATTERN,
  MCP_GRANT_ABSOLUTE_MAX_AGE_MS,
  MCP_GRANT_IDLE_TIMEOUT_MS,
  MCP_OFFLINE_ACCESS_SCOPE,
  rejectCode,
} from "@ai-catalyst/services/mcp-auth/types";
import {
  getAuthorizableUserById,
  getOAuthClientByClientId,
  isValidPublicOAuthClientRecord,
} from "@ai-catalyst/services/mcp-auth/internal/lookups";

// --- Refresh token pre-flight ---

interface RefreshTokenLookupRow {
  refresh_token_expires_at: Date;
  scopes: string;
  client_id: string;
  user_id: string | null;
  // Last rotation time — seeds missing grant rows only; lifetimes use granted_at.
  created_at: Date;
}

/**
 * Pre-flight for `refresh_token` grant: re-validates user (Better Auth copies
 * userId without checking), enforces idle/absolute limits, and speaks one OAuth
 * error dialect. Not purely read-only — retires expired grants before rejecting.
 * Missing-row is always `invalid_grant` (rotation deletes the presented row).
 */
export async function checkRefreshTokenIsRedeemable(params: {
  refreshToken: unknown;
  clientId: unknown;
}): Promise<AuthorizationCodeCheckResult> {
  const { refreshToken, clientId } = params;

  if (
    typeof refreshToken !== "string" ||
    !MCP_BEARER_TOKEN_PATTERN.test(refreshToken)
  ) {
    return rejectCode("invalid_grant", "Invalid refresh token.");
  }

  if (typeof clientId !== "string" || clientId.length === 0) {
    return rejectCode("invalid_client", "client_id is required.");
  }

  const result = await pool.query<RefreshTokenLookupRow>(
    `select refresh_token_expires_at, scopes, client_id, user_id, created_at
     from mcp_oauth_access_tokens
     where refresh_token = $1`,
    [refreshToken],
  );
  const row = result.rows[0];
  if (!row) {
    return rejectCode("invalid_grant", "Invalid refresh token.");
  }

  if (row.refresh_token_expires_at.getTime() <= Date.now()) {
    return rejectCode("invalid_grant", "Refresh token has expired.");
  }

  if (row.client_id !== clientId) {
    return rejectCode(
      "invalid_client",
      "client_id does not match the refresh token.",
    );
  }

  const client = await getOAuthClientByClientId(clientId);
  if (!isValidPublicOAuthClientRecord(client)) {
    return rejectCode(
      "invalid_client",
      "Unknown, disabled, or non-public OAuth client.",
    );
  }

  const scopes = row.scopes.split(" ").filter((scope) => scope.length > 0);
  if (!scopes.includes(MCP_OFFLINE_ACCESS_SCOPE)) {
    return rejectCode(
      "invalid_grant",
      "This token was not issued for the offline_access scope.",
    );
  }

  if (!row.user_id || !(await getAuthorizableUserById(row.user_id))) {
    return rejectCode(
      "invalid_grant",
      "The account for this refresh token is no longer usable.",
    );
  }

  // --- Connection lifetime ---
  const limits = await loadGrantLimits(row.user_id, row.client_id);

  if (!limits) {
    // Fail open for tokens minted between 0008 and this deploy.
    await pool.query(
      `insert into mcp_oauth_grants (user_id, client_id, granted_at)
       values ($1, $2, $3)
       on conflict (user_id, client_id) do nothing`,
      [row.user_id, row.client_id, row.created_at],
    );
    return { ok: true };
  }

  const now = Date.now();
  const grantedAt = limits.granted_at.getTime();

  if (now - grantedAt > MCP_GRANT_ABSOLUTE_MAX_AGE_MS) {
    await retireMcpGrant(row.user_id, row.client_id);
    return rejectCode(
      "invalid_grant",
      "This connection has reached its maximum age and must be re-authorised.",
    );
  }

  // No tool call yet counts from granted_at, not as idle.
  const lastActiveAt = limits.last_used_at?.getTime() ?? grantedAt;
  if (now - lastActiveAt > MCP_GRANT_IDLE_TIMEOUT_MS) {
    await retireMcpGrant(row.user_id, row.client_id);
    return rejectCode(
      "invalid_grant",
      "This connection has been idle too long and must be re-authorised.",
    );
  }

  return { ok: true };
}

/**
 * Deletes every token row for the same user+client except the new one, after
 * a successful refresh. Run only on confirmed success — old access token dies
 * with the row (OAuth 2.1 rotation-as-revocation).
 */
export async function rotateOutMcpRefreshToken(params: {
  presentedRefreshToken: string;
  newRefreshToken: string;
}): Promise<number> {
  const { presentedRefreshToken, newRefreshToken } = params;
  if (
    typeof presentedRefreshToken !== "string" ||
    presentedRefreshToken.length === 0 ||
    typeof newRefreshToken !== "string" ||
    newRefreshToken.length === 0
  ) {
    return 0;
  }

  const family = await pool.query(
    `with new_row as (
       select user_id, client_id
       from mcp_oauth_access_tokens
       where refresh_token = $1
     )
     delete from mcp_oauth_access_tokens t
     using new_row n
     where t.user_id is not distinct from n.user_id
       and t.client_id = n.client_id
       and t.refresh_token <> $1`,
    [newRefreshToken],
  );
  if ((family.rowCount ?? 0) > 0) {
    return family.rowCount ?? 0;
  }

  const fallback = await pool.query(
    `delete from mcp_oauth_access_tokens where refresh_token = $1`,
    [presentedRefreshToken],
  );
  return fallback.rowCount ?? 0;
}

/** Caps refresh_token_expires_at to the grant's absolute max — least() only shortens. */
export async function clampMcpRefreshTokenExpiryToGrant(params: {
  refreshToken: string;
}): Promise<void> {
  const { refreshToken } = params;
  if (typeof refreshToken !== "string" || refreshToken.length === 0) {
    return;
  }

  await pool.query(
    `update mcp_oauth_access_tokens t
        set refresh_token_expires_at = least(
              t.refresh_token_expires_at,
              g.granted_at + ($2::bigint * interval '1 millisecond')
            )
       from mcp_oauth_grants g
      where g.user_id = t.user_id
        and g.client_id = t.client_id
        and t.refresh_token = $1`,
    [refreshToken, MCP_GRANT_ABSOLUTE_MAX_AGE_MS],
  );
}

/**
 * Retires a grant at a lifetime limit. No consent withdrawal row — expiry is
 * not a decision; hasEverAuthorised stays true for "reconnect" UX.
 */
async function retireMcpGrant(userId: string, clientId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `delete from mcp_oauth_access_tokens where user_id = $1 and client_id = $2`,
      [userId, clientId],
    );
    await client.query(
      `delete from mcp_oauth_grants where user_id = $1 and client_id = $2`,
      [userId, clientId],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

interface GrantLimitRow {
  granted_at: Date;
  last_used_at: Date | null;
}

/** granted_at plus max audit activity since it; null when no grant row. */
async function loadGrantLimits(
  userId: string,
  clientId: string,
): Promise<GrantLimitRow | null> {
  const result = await pool.query<GrantLimitRow>(
    `select
       g.granted_at,
       (select max(a.created_at)
          from mcp_tool_audit_logs a
         where a.user_id = g.user_id
           and a.created_at >= g.granted_at) as last_used_at
     from mcp_oauth_grants g
     where g.user_id = $1 and g.client_id = $2`,
    [userId, clientId],
  );
  return result.rows[0] ?? null;
}

function hashRefreshToken(refreshToken: string): string {
  return createHash("sha256").update(refreshToken, "utf8").digest("hex");
}

const REFRESH_CLAIM_TTL_SECONDS = 60;

/**
 * Atomic claim so one concurrent refresh proceeds — Better Auth's branch is
 * non-destructive. Loser gets `invalid_grant` (same as replay). Swept by oauth:cleanup.
 */
export async function tryClaimRefreshToken(
  refreshToken: string,
): Promise<boolean> {
  if (typeof refreshToken !== "string" || refreshToken.length === 0) {
    return false;
  }
  const result = await pool.query(
    `insert into mcp_oauth_refresh_claims (refresh_token_hash, expires_at)
     values ($1, now() + interval '1 second' * $2)
     on conflict (refresh_token_hash) do nothing`,
    [hashRefreshToken(refreshToken), REFRESH_CLAIM_TTL_SECONDS],
  );
  return (result.rowCount ?? 0) > 0;
}
