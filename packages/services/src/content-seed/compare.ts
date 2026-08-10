// Canonical comparison helpers. Content mismatch detection must not depend
// on object key order (Postgres round-trips jsonb with its own key
// ordering) or rely on `JSON.stringify` directly comparing raw column
// values, since a value read back from `pg` (e.g. an array column) is not
// guaranteed to be reference-equal in shape to the JS literal that produced
// it.

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sortedKeys = Object.keys(record).sort();
    const result: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      result[key] = canonicalize(record[key]);
    }
    return result;
  }
  return value;
}

export function canonicalJsonEquals(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonicalize(a)) === JSON.stringify(canonicalize(b));
}

/**
 * Field-wise canonical JSON diff — empty means content-equivalent.
 * Record<string, unknown> because callers compare camelCase constants to snake_case rows.
 */
export function diffFields(
  expected: Record<string, unknown>,
  actual: Record<string, unknown>,
  fields: readonly string[],
): string[] {
  const differing: string[] = [];
  for (const field of fields) {
    if (!canonicalJsonEquals(expected[field], actual[field])) {
      differing.push(field);
    }
  }
  return differing;
}

/**
 * Bidirectional key-set diff — both missing and extra keys are errors so
 * stale or concurrent rows cannot hide from the reconciler.
 */
export function diffKeySets(
  expectedKeys: readonly string[],
  actualKeys: readonly string[],
): { missing: string[]; extra: string[] } {
  const expectedSet = new Set(expectedKeys);
  const actualSet = new Set(actualKeys);
  const missing = expectedKeys.filter((key) => !actualSet.has(key));
  const extra = actualKeys.filter((key) => !expectedSet.has(key));
  return { missing, extra };
}
