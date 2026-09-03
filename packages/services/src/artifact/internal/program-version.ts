import { ServiceError } from "@ai-catalyst/services/errors";

import type { QueryExecutor } from "@ai-catalyst/services/internal/transaction";

/** Shared by render-workbook.ts and export-document.ts — both stamp this into their Provenance. */
export async function loadProgramVersionNumber(
  executor: QueryExecutor,
  programRunId: string,
): Promise<number> {
  const result = await executor.query<{ version_number: number }>(
    `select pv.version_number
     from program_runs pr
     join program_versions pv on pv.id = pr.program_version_id
     where pr.id = $1`,
    [programRunId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new ServiceError(
      "INTERNAL_INVARIANT_ERROR",
      `program_run ${programRunId} has no resolvable program_version.`,
    );
  }
  return row.version_number;
}
