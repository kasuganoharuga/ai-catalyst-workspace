// `pnpm --filter web run oauth:cleanup` — deletes expired/orphaned rows from
// the four `mcp_oauth_*` tables (see
// infra/database/migrations/0004_mcp_oauth_provider_schema.sql and
// packages/services/src/mcp-auth's `cleanupExpiredMcpOAuthState`). Safe to
// run repeatedly and on a schedule (e.g. a periodic job once this is
// deployed) — nothing it deletes is still reachable by any live request
// path.
import { config } from "dotenv";
import path from "node:path";

// Must run before importing @ai-catalyst/db (reads DATABASE_URL at module
// load time) — see check-auth-schema.ts's identical comment.
config({ path: path.resolve(__dirname, "../.env.local") });

async function main(): Promise<void> {
  const [{ pool }, { cleanupExpiredMcpOAuthState }] = await Promise.all([
    import("@ai-catalyst/db"),
    import("@ai-catalyst/services/mcp-auth"),
  ]);

  try {
    const result = await cleanupExpiredMcpOAuthState();
    console.log(
      `Deleted ${result.expiredAccessTokensDeleted} expired access token(s), ` +
        `${result.expiredConsentClaimsDeleted} expired consent claim(s), ` +
        `${result.orphanedApplicationsDeleted} orphaned DCR application(s).`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
