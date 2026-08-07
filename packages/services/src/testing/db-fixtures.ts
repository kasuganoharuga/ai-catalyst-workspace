import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { pool } from "@ai-catalyst/db";

import { seedToolkitContent } from "@ai-catalyst/services/content-seed";
import type { ToolkitSeedContent } from "@ai-catalyst/services/content-seed";

// Shared fixtures for every DB-backed test suite in the workspace. apps/mcp
// depends on this specifically because dependency-cruiser forbids it from
// importing @ai-catalyst/db directly; packages/services suites use it to avoid
// each keeping its own copy of the same setup and teardown.

/**
 * A Founder actor for services that only read `userId`/`role` off it. The id is
 * random rather than a real fixture user's, so it must not be used by anything
 * that resolves the actor against the `users` table.
 */
export function founderActor(): ActorContext {
  return { userId: randomUUID(), role: "founder" };
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/** Wraps seedToolkitContent in its own transaction — see withTransaction's own comment. */
export async function seedFixtureProgram(
  content: ToolkitSeedContent,
): Promise<void> {
  await withTransaction((client) => seedToolkitContent(client, content));
}

export interface FixtureFounderAccount {
  userId: string;
  workspaceId: string;
}

/**
 * Inserts a fixture Founder user + Workspace directly, bypassing invitation
 * acceptance (out of scope for the suites that use this).
 *
 * Callers that need to clean up afterwards should record the returned `userId`
 * themselves — this helper deliberately keeps no registry, so each suite stays
 * in charge of its own teardown ordering.
 *
 * `slugPrefix` only affects the Workspace slug, which no assertion depends on;
 * it exists so a row left behind by a failed run still identifies the suite
 * that created it.
 */
export async function createFixtureFounderAccount(params: {
  label: string;
  emailPrefix: string;
  slugPrefix?: string;
}): Promise<FixtureFounderAccount> {
  const email = `${params.emailPrefix}-${params.label}-${randomUUID()}@example.com`;
  const userResult = await pool.query<{ id: string }>(
    "insert into users (name, email, role) values ($1, $2, 'founder') returning id",
    [`${params.emailPrefix}-${params.label}`, email],
  );
  const userId = userResult.rows[0].id;

  const workspaceResult = await pool.query<{ id: string }>(
    `insert into workspaces (founder_user_id, name, slug)
     values ($1, $2, $3) returning id`,
    [
      userId,
      `Fixture ${params.label}`,
      `${params.slugPrefix ?? "fixture"}-${params.label}-${randomUUID()}`,
    ],
  );

  return { userId, workspaceId: workspaceResult.rows[0].id };
}

/**
 * Inserts a fixture Venture directly, owned by an already-created fixture
 * Workspace. `slugPrefix` serves the same debugging purpose as it does on
 * createFixtureFounderAccount.
 */
export async function createFixtureVenture(params: {
  workspaceId: string;
  createdByUserId: string;
  label: string;
  slugPrefix?: string;
}): Promise<string> {
  const ventureResult = await pool.query<{ id: string }>(
    `insert into ventures (workspace_id, created_by_user_id, name, slug)
     values ($1, $2, $3, $4) returning id`,
    [
      params.workspaceId,
      params.createdByUserId,
      `Fixture Venture ${params.label}`,
      `${params.slugPrefix ?? "fixture-venture"}-${params.label}-${randomUUID()}`,
    ],
  );
  return ventureResult.rows[0].id;
}

/** Reads back a Run/Branch's program_run_modules, in sequence order — for tests that need the raw id (e.g. to drive startOrResumeAttempt) without depending on listRunModules' own Active-Context resolution. */
export async function getFixtureRunModuleIds(
  activeBranchId: string,
): Promise<string[]> {
  const result = await pool.query<{ id: string }>(
    `select id from program_run_modules where program_run_branch_id = $1 order by sequence_index`,
    [activeBranchId],
  );
  return result.rows.map((row) => row.id);
}

export interface FixtureMcpToolAuditLogRow {
  outcome: string;
  workspace_id: string | null;
  program_run_id: string | null;
  program_run_branch_id: string | null;
  program_run_module_id: string | null;
  module_attempt_id: string | null;
  error_code: string | null;
  result_metadata: Record<string, unknown>;
  request_metadata: Record<string, unknown>;
}

/** Reads back the most recent mcp_tool_audit_logs row for (userId, toolName) — for asserting on what recordMcpToolCall actually wrote. */
export async function getLatestFixtureMcpToolAuditLogRow(
  userId: string,
  toolName: string,
): Promise<FixtureMcpToolAuditLogRow | null> {
  const result = await pool.query<FixtureMcpToolAuditLogRow>(
    `select outcome, workspace_id, program_run_id, program_run_branch_id, program_run_module_id,
            module_attempt_id, error_code, result_metadata, request_metadata
     from mcp_tool_audit_logs
     where user_id = $1 and tool_name = $2
     order by created_at desc
     limit 1`,
    [userId, toolName],
  );
  return result.rows[0] ?? null;
}

/** Reads back a module_attempts row's current status — for tests asserting a write Tool's side effect landed. */
export async function getFixtureModuleAttemptStatus(
  attemptId: string,
): Promise<string> {
  const result = await pool.query<{ status: string }>(
    "select status from module_attempts where id = $1",
    [attemptId],
  );
  return result.rows[0].status;
}

/**
 * Deletes every row this module's fixture helpers may have created for
 * the given fixture `userIds`/`programKey`, in dependency order — mirrors
 * the `afterAll` cleanup duplicated across every packages/services
 * *.db.test.ts suite that builds a Founder/Workspace/Venture/Run/Attempt
 * fixture (see e.g. artifact/index.db.test.ts's own afterAll comment for
 * why artifact_submissions/user_active_contexts must be deleted
 * explicitly ahead of the ventures cascade).
 */
export async function cleanupFixtureAccounts(params: {
  userIds: string[];
  programKey: string;
}): Promise<void> {
  const { userIds, programKey } = params;
  await pool.query(
    "delete from mcp_tool_audit_logs where user_id = any($1::uuid[])",
    [userIds],
  );
  await pool.query(
    "delete from user_active_contexts where user_id = any($1::uuid[])",
    [userIds],
  );
  await pool.query(
    "delete from artifact_submissions where workspace_id in (select id from workspaces where founder_user_id = any($1::uuid[]))",
    [userIds],
  );
  await pool.query(
    "delete from ventures where workspace_id in (select id from workspaces where founder_user_id = any($1::uuid[]))",
    [userIds],
  );
  await pool.query(
    "delete from workspaces where founder_user_id = any($1::uuid[])",
    [userIds],
  );
  await pool.query("delete from users where id = any($1::uuid[])", [userIds]);
  await pool.query("delete from programs where program_key = $1", [programKey]);
}
