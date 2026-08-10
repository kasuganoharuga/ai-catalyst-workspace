import { ServiceError } from "@ai-catalyst/services/errors";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Malformed ids map to NOT_FOUND (not VALIDATION_ERROR) so lookups stay enumeration-safe and never hit raw SQL ::uuid (22P02 → 500).
// package.json export is Turbopack resolution only — not public API (see internal/slug.ts).
export function parseEntityIdOrNotFound(
  value: string,
  notFoundMessage: string,
): string {
  if (!UUID_PATTERN.test(value)) {
    throw new ServiceError("NOT_FOUND", notFoundMessage);
  }
  return value;
}
