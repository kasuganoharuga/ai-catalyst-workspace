import type { PoolClient } from "pg";

import type { PreferredAiProvider } from "@ai-catalyst/shared";

// Single source of truth for valid preferred_ai_provider values (matches DB check constraint).
export function isPreferredAiProvider(
  value: unknown,
): value is PreferredAiProvider {
  return value === "claude" || value === "openai";
}

/**
 * Single write path for `user_profiles.preferred_ai_provider` — profile and
 * mcp-auth share it so semantics cannot drift. Accepts a query executor for
 * transactional grant writes. Cannot write null (null reopens first-run dialog).
 */
export async function upsertPreferredAiProvider(
  executor: Pick<PoolClient, "query">,
  userId: string,
  provider: PreferredAiProvider,
): Promise<void> {
  // The `where … is distinct from …` skips redundant writes on reconnect.
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
