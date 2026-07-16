import { ServiceError } from "@ai-catalyst/services/errors";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// A syntactically invalid id and a well-formed-but-nonexistent id both just
// "don't exist" from the caller's point of view — routing a malformed id to
// NOT_FOUND (rather than VALIDATION_ERROR) keeps every lookup enumeration-
// safe and, critically, keeps it from ever reaching a raw SQL `::uuid` cast,
// which would otherwise surface as Postgres 22P02 (an ugly 500) instead of
// a normal business error. Shared by venture/index.ts and
// workspace/active-context.ts, both of which take a Venture id from an
// untrusted caller. Listed under "./internal/entity-id" in package.json
// only so Turbopack can resolve this module's cross-file imports (see
// internal/slug.ts for why) — not part of the intended public API.
export function parseEntityIdOrNotFound(
  value: string,
  notFoundMessage: string,
): string {
  if (!UUID_PATTERN.test(value)) {
    throw new ServiceError("NOT_FOUND", notFoundMessage);
  }
  return value;
}
