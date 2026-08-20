import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type {
  MentorArtefactDocument,
  MentorArtefactSummary,
  MentorFounderDetail,
  MentorFounderSummary,
  WorkspaceStatus,
} from "@ai-catalyst/shared";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import { parseEntityIdOrNotFound } from "@ai-catalyst/services/internal/entity-id";
import {
  listRunModulesForBranch,
  resolveWorkspaceRunContext,
} from "@ai-catalyst/services/internal/run-module";
import { getGeneratedTextContent } from "@ai-catalyst/services/storage";

// Mentor supervision surface — read-only; cannot advance or roll back Founder progress.

/**
 * Mentor authority is per-Workspace (workspaces.mentor_user_id), never global.
 * NOT_FOUND on mismatch — FORBIDDEN would confirm the Workspace exists (enumeration oracle).
 */
async function assertMentorOwnsWorkspace(
  actor: ActorContext,
  workspaceId: string,
): Promise<void> {
  const result = await pool.query(
    `select 1 from workspaces where id = $1 and mentor_user_id = $2`,
    [workspaceId, actor.userId],
  );

  if (result.rowCount === 0) {
    throw new ServiceError("NOT_FOUND", "Founder not found.");
  }
}

interface FounderSummaryRow {
  workspace_id: string;
  workspace_name: string;
  workspace_status: WorkspaceStatus;
  founder_user_id: string;
  founder_name: string | null;
  founder_email: string;
  total_modules: string | null;
  completed_modules: string | null;
  last_completed_at: Date | null;
}

function mapFounderSummaryRow(row: FounderSummaryRow): MentorFounderSummary {
  return {
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    workspaceStatus: row.workspace_status,
    founderUserId: row.founder_user_id,
    founderName: row.founder_name,
    founderEmail: row.founder_email,
    // bigint counts as strings; null means no Run yet — distinct from "0 of N".
    totalModules: row.total_modules === null ? null : Number(row.total_modules),
    completedModules:
      row.completed_modules === null ? null : Number(row.completed_modules),
    lastCompletedAt: row.last_completed_at?.toISOString() ?? null,
  };
}

// Prefers user_profiles display name; falls back to users.name (often email at registration).
const FOUNDER_IDENTITY_COLUMNS = `
  w.id as workspace_id,
  w.name as workspace_name,
  w.status as workspace_status,
  u.id as founder_user_id,
  nullif(trim(concat_ws(' ', p.first_name, p.last_name)), '') as founder_name,
  coalesce(p.contact_email, u.email) as founder_email
`;

/**
 * Every Founder this Mentor covers, with progress for triage.
 * One query with lateral aggregates; null counts when no Run yet.
 * Excludes setup Module 0 — system-driven, hidden from Founder's catalog.
 */
export async function listMentorFounders(
  actor: ActorContext,
): Promise<MentorFounderSummary[]> {
  assertRole(actor, ["mentor"]);

  const result = await pool.query<FounderSummaryRow>(
    `select
       ${FOUNDER_IDENTITY_COLUMNS},
       progress.total_modules,
       progress.completed_modules,
       progress.last_completed_at
     from workspaces w
     join users u on u.id = w.founder_user_id
     left join user_profiles p on p.user_id = u.id
     left join lateral (
       select r.active_branch_id
       from program_runs r
       where r.workspace_id = w.id
         and r.status <> 'archived'
         and r.active_branch_id is not null
       order by r.created_at desc
       limit 1
     ) run on true
     left join lateral (
       select
         count(*) as total_modules,
         count(*) filter (where m.status = 'completed') as completed_modules,
         max(m.completed_at) as last_completed_at
       from program_run_modules m
       join module_definitions d on d.id = m.module_definition_id
       where m.program_run_branch_id = run.active_branch_id
         and d.module_type <> 'setup'
         and d.status = 'active'
     ) progress on run.active_branch_id is not null
     where w.mentor_user_id = $1
       and u.deleted_at is null
     order by w.name, w.id`,
    [actor.userId],
  );

  return result.rows.map(mapFounderSummaryRow);
}

interface ArtefactSummaryRow {
  module_key: string;
  artifact_key: string;
  name: string;
  required_filename: string | null;
  version_number: number;
  saved_at: Date;
}

function mapArtefactSummaryRow(row: ArtefactSummaryRow): MentorArtefactSummary {
  return {
    moduleKey: row.module_key,
    artifactKey: row.artifact_key,
    name: row.name,
    requiredFilename: row.required_filename,
    versionNumber: row.version_number,
    savedAt: row.saved_at.toISOString(),
  };
}

// Live deliverables on one Run/Branch — draft/submitted only; DISTINCT ON highest version.
// Excludes setup Module 0 (machine-written, not Founder work).
const MENTOR_ARTEFACT_QUERY = `
  select distinct on (d.artifact_key)
    m.module_key,
    d.artifact_key,
    d.name,
    d.required_filename,
    s.version_number,
    coalesce(s.submitted_at, s.updated_at) as saved_at
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
 * One Founder's progress and deliverables. Raw answers and failed Attempts excluded —
 * Mentors review finished work, not in-progress drafting.
 */
export async function getMentorFounderDetail(
  actor: ActorContext,
  rawWorkspaceId: string,
): Promise<MentorFounderDetail> {
  assertRole(actor, ["mentor"]);
  const workspaceId = parseEntityIdOrNotFound(
    rawWorkspaceId,
    "Founder not found.",
  );
  await assertMentorOwnsWorkspace(actor, workspaceId);

  const founderResult = await pool.query<FounderSummaryRow>(
    `select
       ${FOUNDER_IDENTITY_COLUMNS},
       null::bigint as total_modules,
       null::bigint as completed_modules,
       null::timestamptz as last_completed_at
     from workspaces w
     join users u on u.id = w.founder_user_id
     left join user_profiles p on p.user_id = u.id
     where w.id = $1`,
    [workspaceId],
  );

  const founderRow = founderResult.rows[0];
  if (!founderRow) {
    throw new ServiceError("NOT_FOUND", "Founder not found.");
  }

  const run = await resolveWorkspaceRunContext(workspaceId);
  if (!run) {
    // Invitation accepted, Run never started — render empty state, not an error.
    return {
      founder: mapFounderSummaryRow(founderRow),
      modules: [],
      artefacts: [],
    };
  }

  const [allModules, artefactResult] = await Promise.all([
    listRunModulesForBranch(run.activeBranchId),
    pool.query<ArtefactSummaryRow>(MENTOR_ARTEFACT_QUERY, [run.activeBranchId]),
  ]);

  // Same setup Module exclusion as listMentorFounders.
  const modules = allModules.filter((module) => module.moduleType !== "setup");
  const completed = modules.filter((module) => module.status === "completed");
  const completedAts = completed
    .map((module) => module.completedAt)
    .filter((value): value is string => value !== null);

  return {
    founder: {
      ...mapFounderSummaryRow(founderRow),
      totalModules: modules.length,
      completedModules: completed.length,
      lastCompletedAt:
        completedAts.length > 0
          ? completedAts.reduce((a, b) => (a > b ? a : b))
          : null,
    },
    modules,
    artefacts: artefactResult.rows.map(mapArtefactSummaryRow),
  };
}

interface ArtefactDocumentRow extends ArtefactSummaryRow {
  module_title: string;
  primary_storage_object_id: string | null;
}

/**
 * One saved deliverable with body for read-only Mentor view.
 * Returns null when not saved yet; NOT_FOUND when Workspace is not covered.
 */
export async function getMentorArtefactDocument(
  actor: ActorContext,
  rawWorkspaceId: string,
  moduleKey: string,
  artifactKey: string,
): Promise<MentorArtefactDocument | null> {
  assertRole(actor, ["mentor"]);
  const workspaceId = parseEntityIdOrNotFound(
    rawWorkspaceId,
    "Founder not found.",
  );
  await assertMentorOwnsWorkspace(actor, workspaceId);

  const run = await resolveWorkspaceRunContext(workspaceId);
  if (!run) {
    return null;
  }

  const result = await pool.query<ArtefactDocumentRow>(
    `select distinct on (d.artifact_key)
       m.module_key,
       m.title_snapshot as module_title,
       d.artifact_key,
       d.name,
       d.required_filename,
       s.version_number,
       coalesce(s.submitted_at, s.updated_at) as saved_at,
       f.storage_object_id as primary_storage_object_id
     from program_run_modules m
     join module_attempts a on a.program_run_module_id = m.id
     join artifact_submissions s on s.module_attempt_id = a.id
     join artifact_definitions d on d.id = s.artifact_definition_id
     left join artifact_files f
       on f.artifact_submission_id = s.id and f.is_primary
     where m.program_run_branch_id = $1
       and m.module_key = $2
       and d.artifact_key = $3
       and s.status in ('draft', 'submitted')
     order by d.artifact_key, s.version_number desc`,
    [run.activeBranchId, moduleKey, artifactKey],
  );

  const row = result.rows[0];
  if (!row?.primary_storage_object_id) {
    return null;
  }

  // getGeneratedTextContent re-checks Workspace ownership independently.
  const content = await getGeneratedTextContent(
    actor,
    row.primary_storage_object_id,
  );

  return {
    ...mapArtefactSummaryRow(row),
    moduleTitle: row.module_title,
    content,
  };
}
