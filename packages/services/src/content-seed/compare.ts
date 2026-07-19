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
 * Compares two records field-by-field using canonical JSON equality per
 * field (so jsonb/array columns are compared structurally, not by
 * reference or raw string form) and returns the names of every field that
 * differs. An empty result means the two records are content-equivalent.
 *
 * Deliberately typed as `Record<string, unknown>` rather than a shared
 * generic `T` for both sides: callers compare a camelCase content object
 * against a snake_case database row, which are two different TypeScript
 * shapes by construction.
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
 * Full-graph completeness check for a set of natural keys (module keys,
 * question keys, artifact keys, prompt binding keys, ...). Returns which
 * expected keys are missing from the database and which keys exist in the
 * database but are not expected by this content set. Both directions are
 * errors — the reconciler must never silently accept a database that has
 * *more* rows than expected, or a second concurrent/older run's extra
 * writes would go unnoticed.
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
