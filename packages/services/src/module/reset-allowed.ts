/**
 * Local and staging may reset. Production may not.
 *
 * Only an explicit APP_ENV=production disables the tool. Staging is a
 * Next.js production build (NODE_ENV=production, APP_ENV often unset on
 * the live task definition because deploy-aws.yml only rewrites the
 * image), so treating "unset + production Node" as forbidden hid the
 * button after #177 shipped.
 *
 * Env is read with bracket access so Next/Turbopack cannot replace
 * process.env.APP_ENV at `next build` with the empty Docker-build value.
 *
 * Kept in its own file so the predicate can be unit-tested without
 * loading reset.ts (which imports the database pool).
 */
function readRuntimeEnv(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function resolveResetAppEnv(): string | undefined {
  return readRuntimeEnv("APP_ENV") ?? readRuntimeEnv("NEXT_PUBLIC_APP_ENV");
}

export function isModuleResetAllowed(
  appEnv: string | undefined = resolveResetAppEnv(),
): boolean {
  return appEnv?.trim() !== "production";
}
