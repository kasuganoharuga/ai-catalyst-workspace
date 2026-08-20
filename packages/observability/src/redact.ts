import deniedKeys from "../denied-keys.json" with { type: "json" };

const REDACTED = "[Redacted]";

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/-/g, "_");
}

const DENIED_NORMALIZED = new Set(
  [...deniedKeys.secretKeys, ...deniedKeys.contentKeys].map(normalizeKey),
);

export function isDeniedLogKey(key: string): boolean {
  return DENIED_NORMALIZED.has(normalizeKey(key));
}

export function redactUnknown(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string" || typeof value === "number") {
    return value;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
    };
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactUnknown(item));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(
      value as Record<string, unknown>,
    )) {
      out[key] = isDeniedLogKey(key) ? REDACTED : redactUnknown(child);
    }
    return out;
  }
  return String(value);
}

export function redactValue(value: unknown, keyHint?: string): unknown {
  if (keyHint && isDeniedLogKey(keyHint)) {
    return REDACTED;
  }
  return redactUnknown(value);
}

/**
 * Returns a shallow-safe copy of fields for logging. Never throws —
 * observability must not break Founder request paths.
 */
export function redactLogFields(
  fields: Record<string, unknown>,
): Record<string, unknown> {
  try {
    return redactUnknown(fields) as Record<string, unknown>;
  } catch {
    return {
      event: "log_redaction_failed",
      message: "Failed to redact fields",
    };
  }
}
