import { pool } from "@ai-catalyst/db";

import { ServiceError } from "@ai-catalyst/services/errors";
import type { QueryExecutor } from "@ai-catalyst/services/workspace";

// package.json export for Turbopack only — not public API.
// Resolve published version by stable program_key (highest version_number), not "latest anywhere".
// Accepts QueryExecutor so callers can resolve inside an open transaction.
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
