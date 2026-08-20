import { loggerForService } from "@ai-catalyst/observability/logger";
import { SERVICE_NAMES } from "@ai-catalyst/observability/service-names";

/** Structured logger for apps/web process (SERVICE_NAME aicatalyst-web). */
export const webLog = loggerForService(SERVICE_NAMES.web);
