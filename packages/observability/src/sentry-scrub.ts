import {
  isDeniedLogKey,
  redactUnknown,
} from "@ai-catalyst/observability/redact";

type MutableRecord = Record<string, unknown>;

/**
 * Framework-agnostic Sentry event scrubber. Mutates denied keys in place via
 * the shared redact helpers, then returns the event. Never throws.
 */
export function scrubSentryEvent(event: MutableRecord): MutableRecord {
  try {
    for (const section of ["extra", "contexts", "tags"] as const) {
      const value = event[section];
      if (value && typeof value === "object") {
        event[section] = redactUnknown(value);
      }
    }
    const request = event.request as MutableRecord | undefined;
    if (request && typeof request === "object") {
      for (const part of ["headers", "data", "cookies"] as const) {
        const value = request[part];
        if (value && typeof value === "object") {
          request[part] = redactUnknown(value);
        }
      }
      const headers = request.headers as MutableRecord | undefined;
      if (headers) {
        for (const key of Object.keys(headers)) {
          if (isDeniedLogKey(key)) {
            headers[key] = "[Redacted]";
          }
        }
      }
    }
  } catch {
    // Best-effort.
  }
  return event;
}
