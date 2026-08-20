import * as Sentry from "@sentry/nextjs";

import {
  resolveBrowserAppEnv,
  resolveBrowserRelease,
} from "@ai-catalyst/observability/env";
import { buildSentryInitOptions } from "@ai-catalyst/observability/sentry-init";
import { SERVICE_NAMES } from "@ai-catalyst/observability/service-names";

import { initPostHog } from "@/lib/analytics/posthog";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init(
    buildSentryInitOptions({
      dsn,
      service: SERVICE_NAMES.web,
      environment: resolveBrowserAppEnv(),
      release: resolveBrowserRelease(),
    }) as unknown as Parameters<typeof Sentry.init>[0],
  );
}

initPostHog();
