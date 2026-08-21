import { pool } from "@ai-catalyst/db";

export interface MentorArtifactSubmissionRow {
  program_run_id: string;
  artifact_key: string;
  renderer_key: string | null;
  required_filename: string | null;
  version_number: number;
  primary_storage_object_id: string | null;
  content_sha256: string | null;
}

// Shared by ../export-document.ts and ../render-workbook.ts — both need the
// same submission row (Workspace's active branch + moduleKey + artifactKey)
// before handing its Markdown to an exporter/renderer; only what happens
// with the Markdown afterward differs. Scope matches getMentorArtefactDocument
// (mentor/index.ts): `draft` or `submitted` — a Mentor already reads a
// Founder's draft on screen, so exporting/rendering the same content is not
// a looser read than what the artefact page already shows.
const MENTOR_ARTIFACT_SUBMISSION_QUERY = `
  select distinct on (d.artifact_key)
    m.program_run_id,
    d.artifact_key,
    d.renderer_key,
    d.required_filename,
    s.version_number,
    f.storage_object_id as primary_storage_object_id,
    so.checksum_sha256 as content_sha256
  from program_run_modules m
  join module_attempts a on a.program_run_module_id = m.id
  join artifact_submissions s on s.module_attempt_id = a.id
  join artifact_definitions d on d.id = s.artifact_definition_id
  left join artifact_files f on f.artifact_submission_id = s.id and f.is_primary
  left join storage_objects so on so.id = f.storage_object_id
  where m.program_run_branch_id = $1
    and m.module_key = $2
    and d.artifact_key = $3
    and s.status in ('draft', 'submitted')
  order by d.artifact_key, s.version_number desc
`;

export async function resolveMentorArtifactSubmission(
  activeBranchId: string,
  moduleKey: string,
  artifactKey: string,
): Promise<MentorArtifactSubmissionRow | null> {
  const result = await pool.query<MentorArtifactSubmissionRow>(
    MENTOR_ARTIFACT_SUBMISSION_QUERY,
    [activeBranchId, moduleKey, artifactKey],
  );
  return result.rows[0] ?? null;
}
