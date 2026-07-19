import { pool } from "@ai-catalyst/db";

import { ServiceError } from "@ai-catalyst/services/errors";
import type { QueryExecutor } from "@ai-catalyst/services/workspace";

// Listed under "./internal/program-version" in package.json only so
// Turbopack can resolve this module's cross-file imports (see
// internal/slug.ts for why) — not part of the intended public API.
//
// Selects by a stable program_key, never "the latest published version
// across every Program" — a second Program publishing a version later
// must never change what an existing caller resolves. Picks the highest
// version_number if more than one version of this Program is published.
//
// Takes a QueryExecutor (defaults to the shared pool) rather than always
// querying on the module-level pool directly, so a caller that needs this
// resolution to happen inside its own already-open transaction (e.g.
// getOrCreateProgramRun, which must resolve the version and insert the Run
// atomically) can pass its PoolClient instead of opening a second,
// unsynchronized connection.
export async function resolvePublishedProgramVersionId(
  programKey: string,
  executor: QueryExecutor = pool,
): Promise<string> {
  const result = await executor.query<{ id: string }>(
    `select pv.id
     from programs p
     join program_versions pv on pv.program_id = p.id
     where p.program_key = $1
       and p.status = 'active'
       and pv.status = 'published'
     order by pv.version_number desc
     limit 1`,
    [programKey],
  );

  const row = result.rows[0];
  if (!row) {
    throw new ServiceError(
      "NOT_FOUND",
      `No published program_version exists for program_key "${programKey}".`,
    );
  }
  return row.id;
}
