/**
 * Local and staging may reset. Production may not.
 *
 * Fail closed on a production Node build when APP_ENV is missing —
 * that is how a misconfigured deploy would look, and how staging used
 * to hide the button (NODE_ENV=production, APP_ENV unset-or-ignored).
 * Unset APP_ENV is allowed only in non-production Node (pnpm dev / vitest).
 *
 * Kept in its own file so the predicate can be unit-tested without
 * loading reset.ts (which imports the database pool).
 */
export function isModuleResetAllowed(
  appEnv: string | undefined = process.env.APP_ENV,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  const normalized = appEnv?.trim();
  if (normalized === "production") return false;
  if (normalized === "local" || normalized === "staging") return true;
  return nodeEnv !== "production";
}
