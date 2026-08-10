import { pool } from "@ai-catalyst/db";

// Periodic oauth:cleanup — bounds table growth; correctness is enforced read-time.

const ORPHAN_APPLICATION_GRACE_PERIOD_HOURS = 24;

export interface McpOAuthCleanupResult {
  expiredAccessTokensDeleted: number;
  expiredConsentClaimsDeleted: number;
  expiredRefreshClaimsDeleted: number;
  orphanedGrantsDeleted: number;
  orphanedApplicationsDeleted: number;
}

/** Deletes expired/orphaned mcp_oauth_* rows; idempotent and safe on a schedule. */
export async function cleanupExpiredMcpOAuthState(): Promise<McpOAuthCleanupResult> {
  // Both token halves must be expired — access-only would kill live connections hourly.
  const accessTokens = await pool.query(
    `delete from mcp_oauth_access_tokens
     where access_token_expires_at < now()
       and refresh_token_expires_at < now()`,
  );

  const consentClaims = await pool.query(
    `delete from mcp_oauth_consent_claims where expires_at < now()`,
  );
  const refreshClaims = await pool.query(
    `delete from mcp_oauth_refresh_claims where expires_at < now()`,
  );

  // Safe after token sweep — rotation inserts replacement before family delete.
  const orphanedGrants = await pool.query(
    `delete from mcp_oauth_grants g
      where not exists (
        select 1 from mcp_oauth_access_tokens t
         where t.user_id = g.user_id and t.client_id = g.client_id
      )`,
  );

  // DCR client with no consent row and past grace period.
  const orphanedApplications = await pool.query(
    `delete from mcp_oauth_applications
     where created_at < now() - interval '1 hour' * $1
       and not exists (
         select 1 from mcp_oauth_consents
         where mcp_oauth_consents.client_id = mcp_oauth_applications.client_id
       )`,
    [ORPHAN_APPLICATION_GRACE_PERIOD_HOURS],
  );

  return {
    expiredAccessTokensDeleted: accessTokens.rowCount ?? 0,
    expiredConsentClaimsDeleted: consentClaims.rowCount ?? 0,
    expiredRefreshClaimsDeleted: refreshClaims.rowCount ?? 0,
    orphanedGrantsDeleted: orphanedGrants.rowCount ?? 0,
    orphanedApplicationsDeleted: orphanedApplications.rowCount ?? 0,
  };
}
