import * as Sentry from "@sentry/nextjs";

import { resolveAppEnv, resolveRelease } from "@ai-catalyst/observability/env";
import { scrubSentryEvent } from "@ai-catalyst/observability/sentry-scrub";
import { SERVICE_NAMES } from "@ai-catalyst/observability/service-names";

const dsn = process.env.SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    environment: resolveAppEnv(),
    release: resolveRelease(),
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend(event) {
      return scrubSentryEvent(
        event as unknown as Record<string, unknown>,
      ) as unknown as typeof event;
    },
    initialScope: {
      tags: {
        service: SERVICE_NAMES.web,
      },
    },
  });
}
