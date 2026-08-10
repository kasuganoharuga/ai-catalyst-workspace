import * as Sentry from "@sentry/node";

import { buildSentryInitOptions } from "@ai-catalyst/observability/sentry-init";
import { SERVICE_NAMES } from "@ai-catalyst/observability/service-names";

export function initMcpSentry(): void {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) {
    return;
  }

  Sentry.init(
    buildSentryInitOptions({
      dsn,
      service: SERVICE_NAMES.mcp,
    }) as unknown as Sentry.NodeOptions,
  );
}
