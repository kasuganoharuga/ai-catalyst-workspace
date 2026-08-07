import type { PoolClient } from "pg";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type {
  ProgramRun,
  ProgramRunStatus,
  RunModuleSummary,
  VentureStatus,
} from "@ai-catalyst/shared";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import { resolveFounderWorkspace } from "@ai-catalyst/services/workspace";
import { getActiveContext } from "@ai-catalyst/services/workspace/active-context";
import { assertWorkspaceActive } from "@ai-catalyst/services/internal/workspace";
import { assertVentureWritable } from "@ai-catalyst/services/internal/venture";
import { mapBranchCreatedVia } from "@ai-catalyst/services/internal/branch";
import { resolvePublishedProgramVersionId } from "@ai-catalyst/services/internal/program-version";
import {
  RUN_MODULE_SUMMARY_COLUMNS,
  listRunModulesForBranch,
  mapRunModuleSummaryRow,
  type RunModuleSummaryRow,
} from "@ai-catalyst/services/internal/run-module";
import { parseEntityIdOrNotFound } from "@ai-catalyst/services/internal/entity-id";
import {
  RUN_MODULE_RECONCILE_LOCK_KEY,
  reconcileProgramRunInTransaction,
} from "@ai-catalyst/services/workflow/internal/reconcile-run-modules";
// Imports the Program's content constant directly rather than the whole
// content-seed module, same reasoning as module/catalog.ts.
import { PROGRAM_CONTENT } from "@ai-catalyst/services/content-seed/content/program";

// Program Run / Branch / Module orchestration — shared by apps/web and apps/mcp.

// Deliberately not the same concept as module/catalog.ts's V1_PROGRAM_KEY
// resolution target: the catalog always reflects whatever is published
// right now, while a Run binds to a fixed program_version_id at creation
// and never moves off it, even after a newer version publishes (see
// program_run_modules and resolvePublishedProgramVersionId's own comment).
const V1_PROGRAM_KEY = PROGRAM_CONTENT.programKey;

// Explicit column list (never `select *`) mapped through mapProgramRunRow —
// a future internal-only column added to `program_runs` is never
// accidentally exposed through the DTO just because a query forgot to name
// its columns.
const PROGRAM_RUN_COLUMNS = `
  id, workspace_id, venture_id, program_version_id, active_branch_id,
  run_number, name, status, started_by_user_id, started_at, paused_at,
  completed_at, archived_at, created_at, updated_at
`;

interface ProgramRunRow {
  id: string;
  workspace_id: string;
  venture_id: string;
  program_version_id: string;
  active_branch_id: string | null;
  run_number: number;
  name: string | null;
  status: ProgramRunStatus;
  started_by_user_id: string | null;
  started_at: Date | null;
  paused_at: Date | null;
  completed_at: Date | null;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function mapProgramRunRow(row: ProgramRunRow): ProgramRun {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    ventureId: row.venture_id,
    programVersionId: row.program_version_id,
    activeBranchId: row.active_branch_id,
    runNumber: row.run_number,
    name: row.name,
    status: row.status,
    startedByUserId: row.started_by_user_id,
    startedAt: row.started_at?.toISOString() ?? null,
    pausedAt: row.paused_at?.toISOString() ?? null,
    completedAt: row.completed_at?.toISOString() ?? null,
    archivedAt: row.archived_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

// Runtime validation of untrusted input crossing the API boundary — the
// caller's declared parameter type only describes the happy path.
function normalizeGetOrCreateProgramRunInput(input: unknown): {
  ventureId: string;
} {
  if (typeof input !== "object" || input === null || !("ventureId" in input)) {
    throw new ServiceError("VALIDATION_ERROR", "ventureId is required.");
  }

  const { ventureId } = input as { ventureId: unknown };
  if (typeof ventureId !== "string" || ventureId.trim().length === 0) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "ventureId must be a non-blank string.",
    );
  }

  return { ventureId };
}

interface ActiveModuleDefinitionRow {
  id: string;
  module_key: string;
  title: string;
  sequence_index: number;
}

// Only `status = 'active'` Module Definitions become program_run_modules —
// a 'draft' Module Definition still shows up in the catalog as
// "coming_soon" (module/catalog.ts), but must never become part of a real
// Run's Branch structure until it's actually active.
async function fetchActiveModuleDefinitions(
  client: PoolClient,
  programVersionId: string,
): Promise<ActiveModuleDefinitionRow[]> {
  const result = await client.query<ActiveModuleDefinitionRow>(
    `select id, module_key, title, sequence_index
     from module_definitions
     where program_version_id = $1 and status = 'active'
     order by sequence_index`,
    [programVersionId],
  );
  return result.rows;
}

export interface GetOrCreateProgramRunDependencies {
  // Test-only seam: production always resolves the real V1 Program. Lets
  // tests exercise the create path against an isolated fixture Program
  // without ever touching the real seeded rows (same pattern as
  // module/catalog.ts's ModuleCatalogDependencies).
  programKey?: string;
}

export interface GetOrCreateProgramRunResult {
  run: ProgramRun;
  // true only when this call inserted a brand-new Run (with its first
  // Branch and program_run_modules) — false when an existing non-archived
  // Run for this Venture was found and returned unchanged. Lets the HTTP
  // route answer with 201 vs 200 without re-deriving it from timestamps.
  created: boolean;
}

/**
 * Idempotently ensures a Venture has exactly one non-archived Program Run
 * and returns it — creating the Run, its first Branch, and the Branch's
 * initial program_run_modules snapshot (from the currently published
 * Program Version) if none exists yet.
 *
 * `program_runs_one_active_per_venture` (a partial unique index added in
 * infra/database/migrations/0003_program_runs_one_active_per_venture.sql)
 * is the database-level backstop for "at most one non-archived Run per
 * Venture" — this function's own lookup-then-insert is what makes that
 * invariant race-free rather than just "usually true": the `for update`
 * lock on the Venture row below serializes concurrent calls for the same
 * Venture, so two simultaneous requests can never both decide to insert.
 */
export async function getOrCreateProgramRun(
  actor: ActorContext,
  input: unknown,
  deps: GetOrCreateProgramRunDependencies = {},
): Promise<GetOrCreateProgramRunResult> {
  assertRole(actor, ["founder"]);
  const { ventureId } = normalizeGetOrCreateProgramRunInput(input);
  const id = parseEntityIdOrNotFound(ventureId, "Venture not found.");

  const client = await pool.connect();
  try {
    await client.query("begin");

    const workspace = await resolveFounderWorkspace(actor, client);
    assertWorkspaceActive(workspace.status);

    // Locks the Venture row for the rest of this transaction — a
    // concurrent getOrCreateProgramRun call for the same Venture blocks
    // here until this transaction commits or rolls back, which is what
    // makes both the run_number assignment and the "at most one
    // non-archived Run" invariant below race-free without a separate
    // advisory lock.
    const ventureResult = await client.query<{
      id: string;
      status: VentureStatus;
    }>(
      `select id, status from ventures
       where id = $1 and workspace_id = $2
       for update`,
      [id, workspace.id],
    );
    const venture = ventureResult.rows[0];
    if (!venture) {
      throw new ServiceError("NOT_FOUND", "Venture not found.");
    }
    assertVentureWritable(venture.status);

    // Shared content-seed advisory lock — acquired here, BEFORE either
    // branch below reads any module_definitions row, and always in this
    // order (Venture row lock, then this). Both branches read Module
    // Definitions to build or reconcile this Run's program_run_modules,
    // and a concurrent `pnpm db:seed`/`pnpm db:freeze` (which hold this
    // same key exclusively while they resequence/archive/freeze that
    // content) must never interleave with either read: reading mid-reseed
    // could create a brand new Run from a half-shifted temporary sequence
    // range, or let an existing Run's reconcile see a `mutable` lock that
    // flips to `frozen` moments later — see
    // workflow/internal/reconcile-run-modules.ts's lock-order doc comment
    // for why the order must never reverse (Venture -> SEED_LOCK, never
    // the other way).
    await client.query("select pg_advisory_xact_lock_shared($1)", [RUN_MODULE_RECONCILE_LOCK_KEY]);

    const existingResult = await client.query<ProgramRunRow>(
      `select ${PROGRAM_RUN_COLUMNS} from program_runs
       where venture_id = $1 and status <> 'archived'
       limit 1`,
      [venture.id],
    );
    const existingRow = existingResult.rows[0];
    if (existingRow) {
      // Defensive invariant check, not a normal business validation: every
      // Run this function creates always gets an active_branch_id set
      // within the same transaction below, so a null here would mean some
      // other write path inserted a Run without one.
      if (!existingRow.active_branch_id) {
        throw new ServiceError(
          "INTERNAL_INVARIANT_ERROR",
          `Program Run ${existingRow.id} has no active Branch.`,
        );
      }

      // Lazily front-fills this Run's program_run_modules with anything a
      // "living" (content_lock='mutable') Program Version has grown since
      // this Run was created or last reconciled — see
      // reconcileProgramRunInTransaction's own doc comment for the full
      // contract (it no-ops entirely, zero statements, once V1 is frozen).
      await reconcileProgramRunInTransaction(client, {
        programRunId: existingRow.id,
        programVersionId: existingRow.program_version_id,
      });

      await client.query("commit");
      return { run: mapProgramRunRow(existingRow), created: false };
    }

    // Only a published Program Version may be bound when creating a Run —
    // resolved on this same client so it participates in the transaction
    // this function already holds, per program_runs' own column comment.
    const programVersionId = await resolvePublishedProgramVersionId(
      deps.programKey ?? V1_PROGRAM_KEY,
      client,
    );

    // Not hard-coded to 1: an earlier Run for this Venture (now archived)
    // may already occupy run_number 1 against this same program_version_id
    // — program_runs_venture_version_number_unique would reject a second
    // insert at the same number.
    const runNumberResult = await client.query<{ next_run_number: number }>(
      `select coalesce(max(run_number), 0) + 1 as next_run_number
       from program_runs
       where venture_id = $1 and program_version_id = $2`,
      [venture.id, programVersionId],
    );
    const runNumber = runNumberResult.rows[0].next_run_number;

    // Created directly as 'active' (never left in 'draft') — this
    // function's whole purpose is to hand the Founder a Run they can
    // immediately start working in, not a placeholder needing a separate
    // activation step.
    const runInsertResult = await client.query<ProgramRunRow>(
      `insert into program_runs (
         workspace_id, venture_id, program_version_id, run_number,
         status, started_by_user_id, started_at
       )
       values ($1, $2, $3, $4, 'active', $5, now())
       returning ${PROGRAM_RUN_COLUMNS}`,
      [workspace.id, venture.id, programVersionId, runNumber, actor.userId],
    );
    const runRow = runInsertResult.rows[0];

    // Rejects loudly (via mapBranchCreatedVia) rather than silently
    // defaulting to 'website' for a role nobody has reviewed as a Branch
    // creator — currently a no-op given the assertRole(["founder"]) call
    // above, but stays correct if that allow-list is ever widened.
    const createdVia = mapBranchCreatedVia(actor.role);
    const branchInsertResult = await client.query<{ id: string }>(
      `insert into program_run_branches (
         workspace_id, program_run_id, branch_number, name, status,
         created_via, created_by_user_id
       )
       values ($1, $2, 1, 'Branch 1', 'open', $3, $4)
       returning id`,
      [workspace.id, runRow.id, createdVia, actor.userId],
    );
    const branchId = branchInsertResult.rows[0].id;

    const activeModules = await fetchActiveModuleDefinitions(
      client,
      programVersionId,
    );
    // A Program Version published with zero active Modules is a content
    // configuration bug, not a normal state a Founder can recover from —
    // this must fail the whole transaction (nothing gets created) rather
    // than silently handing back an empty, unusable Run.
    if (activeModules.length === 0) {
      throw new ServiceError(
        "INTERNAL_INVARIANT_ERROR",
        `Program Version ${programVersionId} has no active Modules; cannot start a Program Run.`,
      );
    }

    for (const [index, moduleDefinition] of activeModules.entries()) {
      const isFirstModule = index === 0;
      await client.query(
        `insert into program_run_modules (
           workspace_id, program_run_id, program_version_id,
           program_run_branch_id, module_definition_id, module_key,
           title_snapshot, sequence_index, status, unlocked_at
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          workspace.id,
          runRow.id,
          programVersionId,
          branchId,
          moduleDefinition.id,
          moduleDefinition.module_key,
          moduleDefinition.title,
          moduleDefinition.sequence_index,
          isFirstModule ? "available" : "locked",
          isFirstModule ? new Date() : null,
        ],
      );
    }

    const activatedRunResult = await client.query<ProgramRunRow>(
      `update program_runs set active_branch_id = $1
       where id = $2
       returning ${PROGRAM_RUN_COLUMNS}`,
      [branchId, runRow.id],
    );

    await client.query("commit");
    return {
      run: mapProgramRunRow(activatedRunResult.rows[0]),
      created: true,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------
// Read-only Run/Module resolution — backs apps/mcp's list_modules,
// get_module_status, and packages/services/src/module/context.ts's
// getModuleContext. Never inserts (getOrCreateProgramRun above is the
// only write path); a Founder with no Run yet simply sees an empty list,
// not an error.
// ---------------------------------------------------------------------

export interface CurrentVentureRun {
  workspaceId: string;
  ventureId: string;
  runId: string;
  activeBranchId: string;
}

// Resolves the Founder's current Venture Run via user_active_contexts.
// program_run_modules queries still filter by workspace_id.
async function resolveCurrentVentureRun(actor: ActorContext): Promise<CurrentVentureRun | null> {
  const activeContext = await getActiveContext(actor);
  if (!activeContext.workspaceId || !activeContext.ventureId) {
    return null;
  }

  const result = await pool.query<{ id: string; active_branch_id: string | null }>(
    `select id, active_branch_id from program_runs
     where venture_id = $1 and workspace_id = $2 and status <> 'archived'
     limit 1`,
    [activeContext.ventureId, activeContext.workspaceId],
  );
  const run = result.rows[0];
  if (!run || !run.active_branch_id) {
    return null;
  }

  return {
    workspaceId: activeContext.workspaceId,
    ventureId: activeContext.ventureId,
    runId: run.id,
    activeBranchId: run.active_branch_id,
  };
}

export interface ListRunModulesResult {
  // All three null only when the Founder has no active Venture yet, or
  // that Venture has no non-archived Program Run yet — list_modules (MCP)
  // surfaces this as "nothing to show yet", not an error; creating a Run
  // is the website's job (getOrCreateProgramRun above), never a read
  // tool's side effect.
  workspaceId: string | null;
  ventureId: string | null;
  runId: string | null;
  modules: RunModuleSummary[];
}

/**
 * Lists every program_run_modules row for the Founder's current active
 * Venture's current Run/Branch, in sequence order. Backs the MCP
 * Module list for the list_modules MCP tool.
 */
export async function listRunModules(actor: ActorContext): Promise<ListRunModulesResult> {
  assertRole(actor, ["founder"]);
  const currentRun = await resolveCurrentVentureRun(actor);
  if (!currentRun) {
    return { workspaceId: null, ventureId: null, runId: null, modules: [] };
  }

  return {
    workspaceId: currentRun.workspaceId,
    ventureId: currentRun.ventureId,
    runId: currentRun.runId,
    modules: await listRunModulesForBranch(currentRun.activeBranchId),
  };
}

function normalizeModuleKeyInput(input: unknown): { moduleKey: string } {
  if (typeof input !== "object" || input === null || !("moduleKey" in input)) {
    throw new ServiceError("VALIDATION_ERROR", "moduleKey is required.");
  }
  const { moduleKey } = input as { moduleKey: unknown };
  if (typeof moduleKey !== "string" || moduleKey.trim().length === 0) {
    throw new ServiceError("VALIDATION_ERROR", "moduleKey must be a non-blank string.");
  }
  return { moduleKey };
}

/**
 * Reads a single program_run_modules row, by its content-stable
 * `moduleKey`, within the Founder's current active Venture's current
 * Run/Branch. Backs both the MCP `get_module_status` capability and
 * `getModuleContext` (packages/services/src/module/context.ts), which
 * calls this first to resolve the target Module before loading Attempt/
 * Question/Artifact detail around it.
 */
export async function getRunModuleByKey(
  actor: ActorContext,
  input: unknown,
): Promise<RunModuleSummary> {
  assertRole(actor, ["founder"]);
  const { moduleKey } = normalizeModuleKeyInput(input);
  const currentRun = await resolveCurrentVentureRun(actor);
  if (!currentRun) {
    throw new ServiceError("NOT_FOUND", "Module not found.");
  }

  const result = await pool.query<RunModuleSummaryRow>(
    `select ${RUN_MODULE_SUMMARY_COLUMNS}
     from program_run_modules m
     join module_definitions d on d.id = m.module_definition_id
     where m.program_run_branch_id = $1 and m.module_key = $2`,
    [currentRun.activeBranchId, moduleKey],
  );
  const row = result.rows[0];
  if (!row) {
    throw new ServiceError("NOT_FOUND", "Module not found.");
  }
  return mapRunModuleSummaryRow(row);
}

export interface AttemptRunContext {
  workspaceId: string;
  programRunId: string;
  programRunBranchId: string;
  programRunModuleId: string;
}

/**
 * Resolves the full Run/Branch/Module hierarchy above a given Attempt,
 * scoped to the Founder's own Workspace. Exists purely to let apps/mcp's
 * audit wrapper populate `mcp_tool_audit_logs`' run/branch/module columns
 * for the four Tools whose input is an `attemptId` rather than a
 * `programRunModuleId` (`save_founder_input`, `save_artifact`,
 * `complete_module`, `get_artifact`) — those Services' own DTOs
 * (`ModuleResponse`/`ModuleAttempt`/`ArtifactSubmission`) only carry partial
 * ids — this helper fills run/branch/module columns for audit logging.
 */
export async function resolveAttemptRunContext(
  actor: ActorContext,
  attemptId: string,
): Promise<AttemptRunContext> {
  assertRole(actor, ["founder"]);
  const id = parseEntityIdOrNotFound(attemptId, "Attempt not found.");
  const workspace = await resolveFounderWorkspace(actor);

  const result = await pool.query<{
    program_run_module_id: string;
    program_run_id: string;
    program_run_branch_id: string;
  }>(
    `select a.program_run_module_id, m.program_run_id, m.program_run_branch_id
     from module_attempts a
     join program_run_modules m on m.id = a.program_run_module_id
     where a.id = $1 and a.workspace_id = $2`,
    [id, workspace.id],
  );
  const row = result.rows[0];
  if (!row) {
    throw new ServiceError("NOT_FOUND", "Attempt not found.");
  }

  return {
    workspaceId: workspace.id,
    programRunId: row.program_run_id,
    programRunBranchId: row.program_run_branch_id,
    programRunModuleId: row.program_run_module_id,
  };
}
