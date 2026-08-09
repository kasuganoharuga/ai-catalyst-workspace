import * as Sentry from "@sentry/nextjs";

import { scrubSentryEvent } from "@ai-catalyst/observability/sentry-scrub";
import { SERVICE_NAMES } from "@ai-catalyst/observability/service-names";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
const environment =
  process.env.NEXT_PUBLIC_APP_ENV?.trim() ||
  process.env.APP_ENV?.trim() ||
  "local";
const release =
  process.env.NEXT_PUBLIC_RELEASE?.trim() ||
  process.env.RELEASE?.trim() ||
  undefined;

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    release,
    tracesSampleRate: environment === "production" ? 0.1 : 0.2,
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
