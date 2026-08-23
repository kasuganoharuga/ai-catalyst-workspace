import { pool } from "@ai-catalyst/db";

/**
 * Live deliverables on one Run/Branch — draft/submitted only; DISTINCT ON
 * highest version. Excludes setup Module 0 (machine-written, not Founder
 * work).
 *
 * Lives here rather than in mentor/index.ts so founder-preview.ts can count
 * artefacts on exactly these terms without importing that module: doing so
 * would pull mentor/index.ts's whole graph — including services/storage and
 * its AWS SDK — into founder-preview.ts, which mcp-auth/bearer.ts imports on
 * the MCP token-verification path. It would also make a future
 * mentor/index.ts -> founder-preview.ts import an instant no-circular error.
 * Same reason mentor/internal/resolve-submission.ts exists.
 */
export const MENTOR_ARTEFACT_QUERY = `
  select distinct on (d.artifact_key)
    m.module_key,
    d.artifact_key,
    d.name,
    d.required_filename,
    s.version_number,
    coalesce(s.submitted_at, s.updated_at) as saved_at,
    d.renderer_key
  from program_run_modules m
  join module_definitions md on md.id = m.module_definition_id
  join module_attempts a on a.program_run_module_id = m.id
  join artifact_submissions s on s.module_attempt_id = a.id
  join artifact_definitions d on d.id = s.artifact_definition_id
  where m.program_run_branch_id = $1
    and s.status in ('draft', 'submitted')
    and md.module_type <> 'setup'
  order by d.artifact_key, s.version_number desc
`;

/**
 * How many distinct deliverables are saved on this branch. Wraps the query
 * above rather than counting separately, so "saved artefacts" can never come
 * to mean two different things on two different pages.
 *
 * Caller must authorize the branch — this takes an id, not an actor.
 */
export async function countSavedArtefacts(branchId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `select count(*)::text as count from (${MENTOR_ARTEFACT_QUERY}) artefacts`,
    [branchId],
  );
  return Number(result.rows[0].count);
}
