-- Atomic claim for MCP refresh-token redemption. Better Auth's refresh branch
-- is non-destructive (inserts a new mcp_oauth_access_tokens row without
-- removing the presented one), and our after-hook completes rotation only
-- once the new pair exists. Between those two steps a parallel refresh with
-- the same token can pass the read-only pre-flight and mint a second live
-- chain. This table closes that the same way mcp_oauth_consent_claims closes
-- the Accept race: the /mcp/token before-hook inserts here before the real
-- handler runs, so at most one concurrent redeem proceeds.
--
-- Expired rows are swept by oauth:cleanup
-- (packages/services/src/mcp-auth cleanupExpiredMcpOAuthState).

create table mcp_oauth_refresh_claims (
  refresh_token_hash text primary key,

  claimed_at timestamptz not null default now(),
  expires_at timestamptz not null
);
