/**
 * Keys that must never appear in structured logs or Sentry extras.
 * Matching is case-insensitive on the final path segment.
 */
const DENY_KEY_PATTERN =
  /^(password|passwd|secret|token|authorization|cookie|set-cookie|api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|bearer|private[_-]?key|client[_-]?secret|session)$/i;

/** Nested object paths that often hold Founder / LLM content. */
const DENY_CONTENT_KEYS =
  /^(answer(_text)?|answers|prompt|prompts|claude_?response|response_body|artifact_body|markdown|confirmed_markdown|body|email|phone|authorization)$/i;

const REDACTED = "[Redacted]";

export function isDeniedLogKey(key: string): boolean {
  return DENY_KEY_PATTERN.test(key) || DENY_CONTENT_KEYS.test(key);
}

export function redactValue(value: unknown, keyHint?: string): unknown {
  if (keyHint && isDeniedLogKey(keyHint)) {
    return REDACTED;
  }
  return redactUnknown(value);
}

function redactUnknown(value: unknown): unknown {
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
