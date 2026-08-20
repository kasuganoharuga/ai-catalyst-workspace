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
import { PROGRAM_CONTENT } from "@ai-catalyst/services/content-seed/content/program";

// Program Run / Branch / Module orchestration — shared by apps/web and apps/mcp.

// Run binds to program_version_id at creation; catalog reflects whatever is published now.
const V1_PROGRAM_KEY = PROGRAM_CONTENT.programKey;

// Explicit column list — never `select *` — so internal columns never leak into the DTO.
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

// Runtime validation of untrusted API input.
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

// Only active Module Definitions become program_run_modules — draft stays catalog-only.
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
  // Test seam: isolated fixture Program without touching seeded rows.
  programKey?: string;
}

export interface GetOrCreateProgramRunResult {
  run: ProgramRun;
  // true only when this call inserted a new Run (201 vs 200 for HTTP callers).
  created: boolean;
}

/**
 * Idempotently ensures a Venture has one non-archived Program Run, creating it if needed.
 * Venture `for update` serializes concurrent creates; DB partial unique index is the backstop.
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

    // Venture row lock — serializes run_number assignment and one-active-run invariant.
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

    // Shared SEED_LOCK before reading module_definitions — order: Venture -> SEED_LOCK, never reverse.
    await client.query("select pg_advisory_xact_lock_shared($1)", [
      RUN_MODULE_RECONCILE_LOCK_KEY,
    ]);

    const existingResult = await client.query<ProgramRunRow>(
      `select ${PROGRAM_RUN_COLUMNS} from program_runs
       where venture_id = $1 and status <> 'archived'
       limit 1`,
      [venture.id],
    );
    const existingRow = existingResult.rows[0];
    if (existingRow) {
      // Defensive: every Run we create sets active_branch_id in the same transaction.
      if (!existingRow.active_branch_id) {
        throw new ServiceError(
          "INTERNAL_INVARIANT_ERROR",
          `Program Run ${existingRow.id} has no active Branch.`,
        );
      }

      // Front-fill program_run_modules for living (mutable) Program Versions; no-ops when frozen.
      await reconcileProgramRunInTransaction(client, {
        programRunId: existingRow.id,
        programVersionId: existingRow.program_version_id,
      });

      await client.query("commit");
      return { run: mapProgramRunRow(existingRow), created: false };
    }

    // Only a published Program Version may be bound at Run creation.
    const programVersionId = await resolvePublishedProgramVersionId(
      deps.programKey ?? V1_PROGRAM_KEY,
      client,
    );

    // Next run_number — prior archived Runs may already occupy lower numbers.
    const runNumberResult = await client.query<{ next_run_number: number }>(
      `select coalesce(max(run_number), 0) + 1 as next_run_number
       from program_runs
       where venture_id = $1 and program_version_id = $2`,
      [venture.id, programVersionId],
    );
    const runNumber = runNumberResult.rows[0].next_run_number;

    // Created as 'active' — Founder gets a Run they can work in immediately.
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

    // Rejects unknown roles via mapBranchCreatedVia rather than defaulting to 'website'.
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
    // Zero active Modules is a content bug — fail the transaction, not an empty Run.
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

// --- Read-only Run/Module resolution ---
// Backs MCP list_modules/get_module_status and module/context.ts. Never inserts.

export interface CurrentVentureRun {
  workspaceId: string;
  ventureId: string;
  runId: string;
  activeBranchId: string;
}

// Resolves current Venture Run via user_active_contexts.
async function resolveCurrentVentureRun(
  actor: ActorContext,
): Promise<CurrentVentureRun | null> {
  const activeContext = await getActiveContext(actor);
  if (!activeContext.workspaceId || !activeContext.ventureId) {
    return null;
  }

  const result = await pool.query<{
    id: string;
    active_branch_id: string | null;
  }>(
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
  // All null when no active Venture or Run yet — empty list, not an error.
  workspaceId: string | null;
  ventureId: string | null;
  runId: string | null;
  modules: RunModuleSummary[];
}

/**
 * Lists program_run_modules for the Founder's current Run/Branch in sequence order.
 */
export async function listRunModules(
  actor: ActorContext,
): Promise<ListRunModulesResult> {
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
    throw new ServiceError(
      "VALIDATION_ERROR",
      "moduleKey must be a non-blank string.",
    );
  }
  return { moduleKey };
}

/**
 * Reads one program_run_modules row by moduleKey for the Founder's current Run/Branch.
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
 * Resolves Run/Branch/Module hierarchy for an Attempt — used by MCP audit logging
 * when the tool input is attemptId rather than programRunModuleId.
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
