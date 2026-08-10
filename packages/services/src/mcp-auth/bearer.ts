import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { createMcpActorContext } from "@ai-catalyst/contracts/actor-context";

import { ServiceError } from "@ai-catalyst/services/errors";
import {
  MCP_BEARER_TOKEN_PATTERN,
  MCP_CONNECT_SCOPE,
  canUseMcp,
  isKnownActorRole,
} from "@ai-catalyst/services/mcp-auth/types";
import {
  mcpProviderForRedirectUris,
  parseRedirectUrls,
} from "@ai-catalyst/services/mcp-auth/provider";

// --- Bearer verification ---

interface AccessTokenLookupRow {
  access_token_expires_at: Date;
  scopes: string;
  client_id: string;
  client_disabled: boolean;
  client_type: string;
  client_secret: string | null;
  client_redirect_urls: string | null;
  user_id: string | null;
  user_role: string | null;
  user_deleted_at: Date | null;
}

// V1 public clients: null/empty client_secret required.
function isValidPublicClient(row: AccessTokenLookupRow): boolean {
  return (
    !row.client_disabled &&
    row.client_type === "public" &&
    (row.client_secret === null || row.client_secret === "")
  );
}

/**
 * Verifies MCP platform Bearer token → ActorContext for apps/mcp.
 * UNAUTHENTICATED on bad/expired token; FORBIDDEN on non-Founder or missing mcp:connect.
 * Deliberately skips connection lifetime — enforced at refresh in checkRefreshTokenIsRedeemable.
 */
export async function verifyMcpBearerToken(
  rawToken: unknown,
): Promise<ActorContext> {
  if (
    typeof rawToken !== "string" ||
    !MCP_BEARER_TOKEN_PATTERN.test(rawToken)
  ) {
    throw new ServiceError("UNAUTHENTICATED", "Invalid bearer token.");
  }

  const result = await pool.query<AccessTokenLookupRow>(
    `select
       t.access_token_expires_at,
       t.scopes,
       t.client_id,
       app.disabled as client_disabled,
       app.type as client_type,
       app.client_secret,
       app.redirect_urls as client_redirect_urls,
       u.id as user_id,
       u.role as user_role,
       u.deleted_at as user_deleted_at
     from mcp_oauth_access_tokens t
     join mcp_oauth_applications app on app.client_id = t.client_id
     left join users u on u.id = t.user_id
     where t.access_token = $1`,
    [rawToken],
  );

  const row = result.rows[0];
  if (!row) {
    throw new ServiceError("UNAUTHENTICATED", "Invalid bearer token.");
  }

  if (row.access_token_expires_at.getTime() <= Date.now()) {
    throw new ServiceError("UNAUTHENTICATED", "Bearer token has expired.");
  }

  if (!isValidPublicClient(row)) {
    throw new ServiceError(
      "UNAUTHENTICATED",
      "The OAuth client for this token is no longer valid.",
    );
  }

  if (
    !row.user_id ||
    row.user_deleted_at !== null ||
    !isKnownActorRole(row.user_role)
  ) {
    throw new ServiceError(
      "UNAUTHENTICATED",
      "The account for this token no longer exists.",
    );
  }

  if (row.user_role === "pending") {
    throw new ServiceError(
      "FORBIDDEN",
      "This account has not completed invitation acceptance yet.",
    );
  }

  if (!canUseMcp(row.user_role)) {
    throw new ServiceError(
      "FORBIDDEN",
      "Connecting an AI assistant is available to Founder accounts only.",
    );
  }

  const scopes = row.scopes.split(" ").filter((scope) => scope.length > 0);
  if (!scopes.includes(MCP_CONNECT_SCOPE)) {
    throw new ServiceError(
      "FORBIDDEN",
      "Token is missing the mcp:connect scope.",
    );
  }

  return createMcpActorContext({
    userId: row.user_id,
    role: row.user_role,
    scopes,
    clientId: row.client_id,
    provider: mcpProviderForRedirectUris(
      parseRedirectUrls(row.client_redirect_urls),
    ),
  });
}
