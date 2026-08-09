import * as Sentry from "@sentry/node";

import { resolveAppEnv, resolveRelease } from "@ai-catalyst/observability/env";
import { scrubSentryEvent } from "@ai-catalyst/observability/sentry-scrub";
import { SERVICE_NAMES } from "@ai-catalyst/observability/service-names";

export function initMcpSentry(): void {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment: resolveAppEnv(),
    release: resolveRelease(),
    tracesSampleRate: resolveAppEnv() === "production" ? 0.1 : 0.2,
    sendDefaultPii: false,
    beforeSend(event) {
      return scrubSentryEvent(
        event as unknown as Record<string, unknown>,
      ) as unknown as typeof event;
    },
    initialScope: {
      tags: {
        service: SERVICE_NAMES.mcp,
      },
    },
  });
}
