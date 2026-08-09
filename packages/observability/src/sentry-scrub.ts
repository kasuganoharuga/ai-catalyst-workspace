import { isDeniedLogKey, redactValue } from "@ai-catalyst/observability/redact";

type MutableRecord = Record<string, unknown>;

function scrubRecord(record: MutableRecord | undefined): void {
  if (!record) return;
  for (const key of Object.keys(record)) {
    if (isDeniedLogKey(key)) {
      record[key] = "[Redacted]";
      continue;
    }
    const value = record[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      scrubRecord(value as MutableRecord);
    } else {
      record[key] = redactValue(value, key);
    }
  }
}

/**
 * Framework-agnostic Sentry event scrubber aligned with the logger deny-list.
 * Mutates and returns the event. Never throws.
 */
export function scrubSentryEvent<T extends MutableRecord>(event: T): T {
  try {
    scrubRecord(event.extra as MutableRecord | undefined);
    scrubRecord(event.contexts as MutableRecord | undefined);
    scrubRecord(event.tags as MutableRecord | undefined);
    const request = event.request as MutableRecord | undefined;
    if (request) {
      scrubRecord(request.headers as MutableRecord | undefined);
      scrubRecord(request.data as MutableRecord | undefined);
      scrubRecord(request.cookies as MutableRecord | undefined);
      if (typeof request.headers === "object" && request.headers) {
        const headers = request.headers as MutableRecord;
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
