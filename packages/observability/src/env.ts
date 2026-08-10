import {
  isServiceName,
  SERVICE_NAMES,
  type ServiceName,
} from "@ai-catalyst/observability/service-names";

export type AppEnv = "local" | "staging" | "production";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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

/** Browser / Next client: prefer NEXT_PUBLIC_* then fall back to server names. */
export function resolveBrowserAppEnv(): AppEnv {
  return resolveAppEnv(readEnv("NEXT_PUBLIC_APP_ENV") ?? readEnv("APP_ENV"));
}

export function resolveBrowserRelease(): string | undefined {
  return resolveRelease(
    readEnv("NEXT_PUBLIC_RELEASE") ?? readEnv("RELEASE") ?? readEnv("GIT_SHA"),
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
