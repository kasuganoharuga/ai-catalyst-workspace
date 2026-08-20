import * as Sentry from "@sentry/nextjs";

import { buildSentryInitOptions } from "@ai-catalyst/observability/sentry-init";
import { SERVICE_NAMES } from "@ai-catalyst/observability/service-names";

const dsn = process.env.SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init(
    buildSentryInitOptions({
      dsn,
      service: SERVICE_NAMES.web,
    }) as unknown as Parameters<typeof Sentry.init>[0],
  );
}
