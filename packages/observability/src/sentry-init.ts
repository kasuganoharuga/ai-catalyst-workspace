import {
  resolveAppEnv,
  resolveRelease,
  type AppEnv,
} from "@ai-catalyst/observability/env";
import { scrubSentryEvent } from "@ai-catalyst/observability/sentry-scrub";
import type { ServiceName } from "@ai-catalyst/observability/service-names";

export type BuildSentryInitOptionsInput = {
  dsn: string;
  service: ServiceName;
  /** Override default sample rate (production 0.1, else 0.2). Edge often passes 0. */
  tracesSampleRate?: number;
  environment?: AppEnv;
  release?: string;
};

/**
 * Shared Sentry.init options for web (server/edge/client) and mcp.
 * Runtime-specific DSN selection stays at the call site.
 *
 * Returns a plain object; callers cast to their SDK's Init options type
 * (ErrorEvent generics differ across @sentry/node vs @sentry/nextjs).
 */
export function buildSentryInitOptions(input: BuildSentryInitOptionsInput) {
  const environment = input.environment ?? resolveAppEnv();
  const release = input.release ?? resolveRelease();
  const tracesSampleRate =
    input.tracesSampleRate ?? (environment === "production" ? 0.1 : 0.2);

  return {
    dsn: input.dsn,
    environment,
    ...(release ? { release } : {}),
    tracesSampleRate,
    sendDefaultPii: false as const,
    beforeSend(event: unknown) {
      return scrubSentryEvent(event as Record<string, unknown>);
    },
    initialScope: {
      tags: {
        service: input.service,
      },
    },
  };
}
