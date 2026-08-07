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

// The Mentor supervision surface: read-only, and read-only on purpose.
//
// V1 has no accept/reject here. A Founder still signs their own Module off
// through confirmModuleCompletion, so nothing in this module can advance,
// block, or roll back anyone's progress — `module_attempts.review_notes` and
// friends stay unwritten until a later phase adds a real review flow. Keeping
// the first Mentor release inert means the progress state machine, which
// everything else depends on, is untouched by it.

/**
 * Every scoped read below starts here.
 *
 * A Mentor's authority is per-Workspace (`workspaces.mentor_user_id`), never
 * global: covering three Founders grants nothing over a fourth. Deliberately
 * NOT_FOUND rather than FORBIDDEN on a mismatch — FORBIDDEN would confirm
 * that the Workspace exists, turning this into an oracle a Mentor could walk
 * to enumerate colleagues' Founder rosters. An unmentored Workspace and
 * someone else's are equally "not found" from here.
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
    // Postgres returns bigint counts as strings; null propagates from the
    // left join when the Founder has no Run yet, and must stay null rather
    // than collapsing to 0 — "not started" and "started, nothing done" read
    // very differently to a Mentor deciding who needs a nudge.
    totalModules: row.total_modules === null ? null : Number(row.total_modules),
    completedModules:
      row.completed_modules === null ? null : Number(row.completed_modules),
    lastCompletedAt: row.last_completed_at?.toISOString() ?? null,
  };
}

// Prefers a display name from user_profiles, falling back to users.name —
// which Better Auth seeds with the email address at registration, so it is
// never null but is not always a name.
const FOUNDER_IDENTITY_COLUMNS = `
  w.id as workspace_id,
  w.name as workspace_name,
  w.status as workspace_status,
  u.id as founder_user_id,
  nullif(trim(concat_ws(' ', p.first_name, p.last_name)), '') as founder_name,
  coalesce(p.contact_email, u.email) as founder_email
`;

/**
 * Every Founder this Mentor covers, with enough progress to triage who needs
 * attention.
 *
 * One query, not one per Founder: the module counts come from a lateral
 * aggregate over the Workspace's current Run/Branch rather than a follow-up
 * read per row, so a Mentor with thirty Founders still costs a single round
 * trip. Founders with no Run yet still appear (left join), with null counts.
 *
 * Two laterals rather than one, because `count(*)` over no rows is 0, not
 * null — folding the Run lookup into the aggregate would report a Founder who
 * never started as "0 of 0 modules" instead of "not started". The second
 * lateral's `on run.active_branch_id is not null` is what keeps those columns
 * null in that case.
 *
 * `d.module_type <> 'setup'` excludes Module 0 ("Setup and Connection") from
 * both counts: it is system-driven (`completion_mode = 'system'`, no Founder
 * judgement involved) and hidden from the Founder's own catalog behind
 * `SHOW_SETUP_MODULE` in apps/web/lib/feature-flags.ts. Counting it here
 * would show a Mentor "1 of 2 done" for a Founder who has not actually
 * started anything — a Mentor's view of progress should match what the
 * Founder themselves sees. If that flag is ever flipped back on, this
 * exclusion needs revisiting too.
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

// The live version of each deliverable on one Run/Branch.
//
// `status in ('draft','submitted')` is what excludes superseded and deleted
// rows: saveArtifactSubmission supersedes rather than overwrites, so without
// this filter every past version of every artefact would be listed. DISTINCT
// ON keeps the highest version per artefact should more than one somehow
// survive.
//
// `md.module_type <> 'setup'` excludes Module 0's Setup Summary — machine-
// written storage config, not Founder work, hidden from the Founder's own
// artefacts list for the same reason (see apps/web's artefacts/page.tsx).
//
// Scoped to the branch, so a Mentor never sees work from a Run the Founder
// has since abandoned.
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
 * One supervised Founder's progress and deliverables.
 *
 * Returns Module state and saved artefacts only. `module_responses` — the
 * Founder's raw answers inside their AI assistant — and failed or cancelled
 * Attempts are deliberately not read here: a Mentor reviews finished work,
 * and a Founder who felt watched while drafting would stop drafting on the
 * platform.
 */
export async function getMentorFounderDetail(
  actor: ActorContext,
  rawWorkspaceId: string,
): Promise<MentorFounderDetail> {
  assertRole(actor, ["mentor"]);
  const workspaceId = parseEntityIdOrNotFound(rawWorkspaceId, "Founder not found.");
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
    // Accepted their invitation, never started. A real state to render, not
    // an error — the counts stay null and both lists stay empty.
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

  // Same exclusion as listMentorFounders above: Module 0 is system-driven
  // and hidden from the Founder's own catalog, so it is dropped here too —
  // both from the counts and from the row list this page renders.
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
 * One saved deliverable with its body, for the Mentor's read-only view.
 *
 * Returns null rather than throwing when the artefact has not been saved yet
 * — a Mentor arriving early at a module that is still in progress is normal.
 * A Workspace they do not cover is a NOT_FOUND from assertMentorOwnsWorkspace
 * long before this point.
 */
export async function getMentorArtefactDocument(
  actor: ActorContext,
  rawWorkspaceId: string,
  moduleKey: string,
  artifactKey: string,
): Promise<MentorArtefactDocument | null> {
  assertRole(actor, ["mentor"]);
  const workspaceId = parseEntityIdOrNotFound(rawWorkspaceId, "Founder not found.");
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

  // getGeneratedTextContent re-checks the Mentor's claim on this object's
  // Workspace independently — the ownership assertion above is not passed
  // through to it, so the bytes are gated twice by different lookups.
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
