import type { PoolClient } from "pg";

import type { PreferredAiProvider } from "@ai-catalyst/shared";

// Mirrors the `user_profiles.preferred_ai_provider` check constraint in
// infra/database/migrations/0001_aidb_v5_baseline.sql. The one place that
// knows what a valid value looks like — profile/index.ts and
// mcp-auth/index.ts both import this rather than each re-deriving it.
export function isPreferredAiProvider(
  value: unknown,
): value is PreferredAiProvider {
  return value === "claude" || value === "openai";
}

/**
 * The one write path for `user_profiles.preferred_ai_provider`.
 *
 * Two callers reach it: `setPreferredAiProvider` below, the Founder-facing
 * entry point that the first-run dialog and the profile switcher use, and
 * `recordMcpGrantIssued` in mcp-auth — connecting *is* the third way a
 * Founder chooses an assistant, just indirectly, and letting that path
 * write the column with its own hand-rolled `update` (no insert, no
 * skip-if-unchanged) is exactly how the two write paths' semantics drift
 * apart. This is the fix: mcp-auth calls this function instead of writing
 * SQL of its own, and there is now exactly one upsert to reason about.
 *
 * Takes a query executor rather than always reaching for the module-level
 * `pool`, so recordMcpGrantIssued — which runs this alongside the grant
 * eviction and re-issue inside one transaction — can pass its own
 * `PoolClient` and have this write commit or roll back with the rest of
 * it, instead of running as a second, independent transaction that could
 * succeed while the grant write fails (or the reverse).
 *
 * Deliberately narrow: no role check, no "does a profile row exist yet"
 * branch, and no way to write `null` — `provider` is typed as
 * `PreferredAiProvider`, not `PreferredAiProvider | null`, so the
 * "must never clear back to null" invariant (the first-run dialog reopens
 * the moment this column reads null) is enforced by the compiler here
 * rather than by a runtime check every caller has to remember to keep. The
 * role check belongs to whichever caller has an ActorContext to check —
 * `setPreferredAiProvider` does; recordMcpGrantIssued has no Founder
 * request to authorise, only a client that just finished an OAuth
 * exchange, so there is nothing for it to check.
 */
export async function upsertPreferredAiProvider(
  executor: Pick<PoolClient, "query">,
  userId: string,
  provider: PreferredAiProvider,
): Promise<void> {
  // The `where … is distinct from …` on the conflict clause skips the
  // write (and the `updated_at` bump that would come with it) when the
  // value is already correct — the common case for recordMcpGrantIssued,
  // since most authorisations are a Founder reconnecting the assistant
  // they already had selected.
  await executor.query(
    `insert into user_profiles (user_id, preferred_ai_provider)
     values ($1, $2)
     on conflict (user_id) do update
       set preferred_ai_provider = excluded.preferred_ai_provider,
           updated_at = now()
       where user_profiles.preferred_ai_provider
             is distinct from excluded.preferred_ai_provider`,
    [userId, provider],
  );
}
