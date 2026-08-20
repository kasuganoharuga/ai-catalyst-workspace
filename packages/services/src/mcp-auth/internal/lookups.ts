import { pool } from "@ai-catalyst/db";
import type { ActorRole } from "@ai-catalyst/contracts/actor-context";

import {
  canUseMcp,
  isKnownActorRole,
} from "@ai-catalyst/services/mcp-auth/types";

// Shared lookups for /mcp/token hooks and internal pre-flight checks.

export interface McpOAuthClientRecord {
  clientId: string;
  disabled: boolean;
  type: string;
  clientSecret: string | null;
  redirectUrls: string[];
}

interface OAuthApplicationRow {
  client_id: string;
  disabled: boolean;
  type: string;
  client_secret: string | null;
  redirect_urls: string;
}

export async function getOAuthClientByClientId(
  clientId: string,
): Promise<McpOAuthClientRecord | null> {
  const result = await pool.query<OAuthApplicationRow>(
    `select client_id, disabled, type, client_secret, redirect_urls
     from mcp_oauth_applications
     where client_id = $1`,
    [clientId],
  );
  const row = result.rows[0];
  if (!row) return null;

  return {
    clientId: row.client_id,
    disabled: row.disabled,
    type: row.type,
    clientSecret: row.client_secret,
    redirectUrls: row.redirect_urls.split(","),
  };
}

export function isValidPublicOAuthClientRecord(
  client: McpOAuthClientRecord | null,
): client is McpOAuthClientRecord {
  return (
    client !== null &&
    !client.disabled &&
    client.type === "public" &&
    (client.clientSecret === null || client.clientSecret === "")
  );
}

export interface AuthorizableUser {
  userId: string;
  role: ActorRole;
}

interface UserAuthorizationRow {
  id: string;
  role: string;
  deleted_at: Date | null;
}

/**
 * Issuing gate — null for missing, deleted, or non-Founder. verifyMcpBearerToken
 * is the presenting gate; both must consult canUseMcp.
 */
export async function getAuthorizableUserById(
  userId: string,
): Promise<AuthorizableUser | null> {
  const result = await pool.query<UserAuthorizationRow>(
    `select id, role, deleted_at from users where id = $1`,
    [userId],
  );
  const row = result.rows[0];
  if (
    !row ||
    row.deleted_at !== null ||
    !isKnownActorRole(row.role) ||
    !canUseMcp(row.role)
  ) {
    return null;
  }
  return { userId: row.id, role: row.role };
}
