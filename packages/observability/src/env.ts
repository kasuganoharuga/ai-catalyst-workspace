import {
  isServiceName,
  SERVICE_NAMES,
  type ServiceName,
} from "@ai-catalyst/observability/service-names";

export type AppEnv = "local" | "staging" | "production";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];

function normalizeEnv(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Runtime lookup, for server-side reads only.
 *
 * The bracket access is load-bearing on the server: it stops Next/Turbopack
 * substituting a build-time value, so a container reads whatever its task
 * definition actually sets. The browser needs the exact opposite — see
 * `resolveBrowserAppEnv` below.
 */
function readEnv(name: string): string | undefined {
  return normalizeEnv(process.env[name]);
}

export function resolveAppEnv(
  raw: string | undefined = readEnv("APP_ENV"),
): AppEnv {
  if (raw === "staging" || raw === "production" || raw === "local") {
    return raw;
  }
  // NODE_ENV=production is common in Next.js builds without APP_ENV —
  // treat unknown as local so we never accidentally silence local logs.
  return "local";
}

/**
 * Browser / Next client: prefer NEXT_PUBLIC_* then fall back to server names.
 *
 * The `NEXT_PUBLIC_*` reads below are written as literal member access, not
 * `readEnv("NEXT_PUBLIC_APP_ENV")`, and that is the whole reason these two
 * functions exist separately from `resolveAppEnv` / `resolveRelease`. Next.js
 * exposes a public variable to the browser by substituting the exact source
 * text `process.env.NEXT_PUBLIC_APP_ENV` at build; a dynamic
 * `process.env[name]` lookup is not matched, survives into the bundle as-is,
 * and evaluates to undefined in a browser that has no `process`. Reading these
 * through `readEnv` therefore silently reported every client-side Sentry event
 * with no environment and no release, however the build was configured.
 *
 * The server-name fallbacks stay on `readEnv` on purpose: they are only
 * reachable when this runs on the server, where a runtime read is correct.
 */
export function resolveBrowserAppEnv(): AppEnv {
  return resolveAppEnv(
    normalizeEnv(process.env.NEXT_PUBLIC_APP_ENV) ?? readEnv("APP_ENV"),
  );
}

export function resolveBrowserRelease(): string | undefined {
  return resolveRelease(
    normalizeEnv(process.env.NEXT_PUBLIC_RELEASE) ??
      readEnv("RELEASE") ??
      readEnv("GIT_SHA"),
  );
}

export function resolveServiceName(
  raw: string | undefined = readEnv("SERVICE_NAME"),
  fallback: ServiceName = SERVICE_NAMES.services,
): ServiceName {
  if (raw && isServiceName(raw)) {
    return raw;
  }
  return fallback;
}

export function resolveRelease(
  raw: string | undefined = readEnv("RELEASE") ?? readEnv("GIT_SHA"),
): string | undefined {
  return raw;
}

export function resolveLogLevel(
  raw: string | undefined = readEnv("LOG_LEVEL"),
): LogLevel {
  if (!raw) return "info";
  const normalized = raw.toLowerCase() as LogLevel;
  return LOG_LEVELS.includes(normalized) ? normalized : "info";
}

export function isJsonLogMode(appEnv: AppEnv = resolveAppEnv()): boolean {
  return appEnv === "staging" || appEnv === "production";
}
