import { randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { seedToolkitContent } from "@ai-catalyst/services/content-seed";
import type { ToolkitSeedContent } from "@ai-catalyst/services/content-seed";
import { getOrCreateProgramRun } from "@ai-catalyst/services/workflow";
import { startOrResumeAttempt } from "@ai-catalyst/services/attempt";

import { recordMcpToolCall } from "./index.js";

/**
 * Integration tests against the real Postgres database, following the
 * same fixture pattern as artifact/index.db.test.ts: a fixture Program
 * seeded via the real seedToolkitContent reconciler, real
 * getOrCreateProgramRun / startOrResumeAttempt calls to obtain a real
 * Run/Branch/Module/Attempt hierarchy, then recordMcpToolCall's own
 * insert/error-swallowing behavior exercised against it.
 */

type FixtureModule = ToolkitSeedContent["modules"][number];
type FixtureArtifact = FixtureModule["artifacts"][number];

function buildFixtureArtifact(artifactKey: string): FixtureArtifact {
  return {
    artifactKey,
    sequenceIndex: 1,
    name: `Fixture ${artifactKey}`,
    description: null,
    isRequired: true,
    artifactType: "document",
    sourceFormat: "markdown",
    outputFormat: "markdown",
    requiredFilename: `${artifactKey}.md`,
    rendererKey: null,
    validatorKey: null,
    allowedMimeTypes: ["text/markdown"],
    maxFileSizeBytes: 10_000,
    maxFiles: 1,
    validationConfig: {},
    outputConfig: {},
  };
}

function buildFixtureModule(moduleKey: string, sequenceIndex: number): FixtureModule {
  return {
    moduleKey,
    sequenceIndex,
    title: `Fixture ${moduleKey}`,
    subtitle: null,
    description: null,
    objective: null,
    moduleType: "standard",
    isRequired: true,
    allowRevisions: true,
    completionMode: "artifact",
    estimatedMinutes: null,
    isPublishable: true,
    questions: [],
    artifacts: [buildFixtureArtifact(`${moduleKey}-artifact`)],
  };
}

function buildFixtureContent(programKey: string, modules: FixtureModule[]): ToolkitSeedContent {
  return {
    program: {
      programKey,
      programName: `Audit service test program ${programKey}`,
      programDescription: null,
      versionNumber: 1,
      versionLabel: `v1-${programKey}`,
      versionName: `Fixture v1 ${programKey}`,
      versionDescription: null,
      contentLock: "frozen",
      releaseNotes: null,
    },
    modules,
    prompts: [],
    promptBindings: [],
  };
}

async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
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

interface AuditLogRow {
  request_id: string;
  user_id: string;
  workspace_id: string | null;
  program_run_id: string | null;
  program_run_branch_id: string | null;
  program_run_module_id: string | null;
  module_attempt_id: string | null;
  provider: string;
  tool_name: string;
  outcome: string;
  duration_ms: number;
  request_metadata: Record<string, unknown>;
  result_metadata: Record<string, unknown>;
  error_code: string | null;
  error_message: string | null;
}

async function getAuditLogRow(requestId: string): Promise<AuditLogRow | null> {
  const result = await pool.query<AuditLogRow>(
    `select request_id, user_id, workspace_id, program_run_id, program_run_branch_id,
            program_run_module_id, module_attempt_id, provider, tool_name, outcome,
            duration_ms, request_metadata, result_metadata, error_code, error_message
     from mcp_tool_audit_logs where request_id = $1`,
    [requestId],
  );
  return result.rows[0] ?? null;
}

describe("recordMcpToolCall — database integration", () => {
  const RUN_SUFFIX = randomBytes(4).toString("hex");
  const emailPrefix = `audit-test-${RUN_SUFFIX}`;
  const PROGRAM_KEY = `audit-service-${RUN_SUFFIX}`;
  const createdUserIds: string[] = [];
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  async function createFounderWithWorkspaceAndVenture(
    label: string,
  ): Promise<{ actor: ActorContext; workspaceId: string; ventureId: string }> {
    const email = `${emailPrefix}-${label}-${randomUUID()}@example.com`;
    const userResult = await pool.query<{ id: string }>(
      "insert into users (name, email, role) values ($1, $2, 'founder') returning id",
      [`${emailPrefix}-${label}`, email],
    );
    createdUserIds.push(userResult.rows[0].id);
    const actor: ActorContext = { userId: userResult.rows[0].id, role: "founder" };

    const workspaceResult = await pool.query<{ id: string }>(
      `insert into workspaces (founder_user_id, name, slug)
       values ($1, $2, $3) returning id`,
      [actor.userId, `Fixture ${label}`, `audit-service-${label}-${randomUUID()}`],
    );
    const workspaceId = workspaceResult.rows[0].id;

    const ventureResult = await pool.query<{ id: string }>(
      `insert into ventures (workspace_id, created_by_user_id, name, slug)
       values ($1, $2, $3, $4) returning id`,
      [
        workspaceId,
        actor.userId,
        `Fixture Venture ${label}`,
        `audit-service-venture-${label}-${randomUUID()}`,
      ],
    );

    return { actor, workspaceId, ventureId: ventureResult.rows[0].id };
  }

  beforeAll(async () => {
    await withTransaction((client) =>
      seedToolkitContent(
        client,
        buildFixtureContent(PROGRAM_KEY, [buildFixtureModule("audit-module-a", 0)]),
      ),
    );
  });

  beforeEach(() => {
    // recordMcpToolCall logs swallowed failures to stderr by design —
    // spied on (not asserted against by default) purely so the FK/unique
    // violation tests below don't spam the real test output.
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  afterAll(async () => {
    await pool.query(
      "delete from mcp_tool_audit_logs where user_id = any($1::uuid[])",
      [createdUserIds],
    );
    await pool.query(
      "delete from ventures where workspace_id in (select id from workspaces where founder_user_id = any($1::uuid[]))",
      [createdUserIds],
    );
    await pool.query("delete from workspaces where founder_user_id = any($1::uuid[])", [
      createdUserIds,
    ]);
    await pool.query("delete from users where id = any($1::uuid[])", [createdUserIds]);
    await pool.query("delete from programs where program_key = $1", [PROGRAM_KEY]);
  });

  it("inserts a success row with no Run/Branch/Module/Attempt context", async () => {
    const { actor } = await createFounderWithWorkspaceAndVenture("success-no-context");
    const requestId = randomUUID();

    await recordMcpToolCall({
      requestId,
      actor,
      toolName: "get_active_context",
      outcome: "success",
      durationMs: 42,
    });

    const row = await getAuditLogRow(requestId);
    expect(row).not.toBeNull();
    expect(row?.user_id).toBe(actor.userId);
    // This fixture's actor carries no provider, and "other" is the honest
    // record of that. It used to assert "claude" because the column was
    // hardcoded — which also meant every real ChatGPT call was logged as
    // Claude. See auditProviderFor.
    expect(row?.provider).toBe("other");
    expect(row?.tool_name).toBe("get_active_context");
    expect(row?.outcome).toBe("success");
    expect(row?.duration_ms).toBe(42);
    expect(row?.workspace_id).toBeNull();
    expect(row?.program_run_id).toBeNull();
    expect(row?.error_code).toBeNull();
    expect(row?.result_metadata).toEqual({});
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("folds clientId/scopes/traceId from the ActorContext into request_metadata", async () => {
    const { actor: baseActor } = await createFounderWithWorkspaceAndVenture("actor-metadata");
    const actor: ActorContext = {
      ...baseActor,
      clientId: "claude-desktop",
      scopes: ["mcp:read", "mcp:write"],
      traceId: "trace-123",
    };
    const requestId = randomUUID();

    await recordMcpToolCall({
      requestId,
      actor,
      toolName: "list_modules",
      outcome: "success",
      durationMs: 10,
      requestMetadata: { moduleKey: "audit-module-a" },
    });

    const row = await getAuditLogRow(requestId);
    expect(row?.request_metadata).toEqual({
      moduleKey: "audit-module-a",
      clientId: "claude-desktop",
      scopes: ["mcp:read", "mcp:write"],
      traceId: "trace-123",
    });
  });

  it("records which AI client made the call, from the ActorContext", async () => {
    // The reason provider stopped being hardcoded: with two connectable
    // assistants, an audit log that says "claude" for every row cannot
    // answer the one question it is there to answer.
    const cases = [
      { provider: "openai" as const, toolName: "list_modules" },
      { provider: "claude" as const, toolName: "get_active_context" },
      { provider: "other" as const, toolName: "list_ventures" },
    ];

    for (const { provider, toolName } of cases) {
      const { actor: baseActor } = await createFounderWithWorkspaceAndVenture(
        `provider-${provider}`,
      );
      const requestId = randomUUID();

      await recordMcpToolCall({
        requestId,
        actor: { ...baseActor, provider },
        toolName,
        outcome: "success",
        durationMs: 5,
      });

      const row = await getAuditLogRow(requestId);
      expect(row?.provider).toBe(provider);
    }
  });

  it("defaults clientId/scopes/traceId when absent from the ActorContext", async () => {
    const { actor } = await createFounderWithWorkspaceAndVenture("actor-metadata-defaults");
    const requestId = randomUUID();

    await recordMcpToolCall({
      requestId,
      actor,
      toolName: "list_modules",
      outcome: "success",
      durationMs: 10,
    });

    const row = await getAuditLogRow(requestId);
    expect(row?.request_metadata).toEqual({ clientId: null, scopes: [], traceId: null });
  });

  it("rounds and floors duration_ms at zero for a negative value", async () => {
    const { actor } = await createFounderWithWorkspaceAndVenture("negative-duration");
    const requestId = randomUUID();

    await recordMcpToolCall({
      requestId,
      actor,
      toolName: "get_active_context",
      outcome: "success",
      durationMs: -50,
    });

    const row = await getAuditLogRow(requestId);
    expect(row?.duration_ms).toBe(0);
  });

  it("records a denied outcome with an error code and message, and no context", async () => {
    const { actor } = await createFounderWithWorkspaceAndVenture("denied");
    const requestId = randomUUID();

    await recordMcpToolCall({
      requestId,
      actor,
      toolName: "save_founder_input",
      outcome: "denied",
      durationMs: 5,
      errorCode: "FORBIDDEN",
      errorMessage: "Actor is not a founder.",
    });

    const row = await getAuditLogRow(requestId);
    expect(row?.outcome).toBe("denied");
    expect(row?.error_code).toBe("FORBIDDEN");
    expect(row?.error_message).toBe("Actor is not a founder.");
  });

  it("inserts the full Run/Branch/Module/Attempt hierarchy when provided", async () => {
    const { actor, workspaceId, ventureId } =
      await createFounderWithWorkspaceAndVenture("full-hierarchy");
    const { run } = await getOrCreateProgramRun(actor, { ventureId }, {
      programKey: PROGRAM_KEY,
    });
    const modulesResult = await pool.query<{ id: string }>(
      "select id from program_run_modules where program_run_branch_id = $1 order by sequence_index limit 1",
      [run.activeBranchId],
    );
    const runModuleId = modulesResult.rows[0].id;
    const { attempt } = await startOrResumeAttempt(actor, { programRunModuleId: runModuleId });
    const requestId = randomUUID();

    await recordMcpToolCall({
      requestId,
      actor,
      toolName: "save_artifact",
      outcome: "success",
      durationMs: 15,
      workspaceId,
      programRunId: run.id,
      programRunBranchId: run.activeBranchId,
      programRunModuleId: runModuleId,
      moduleAttemptId: attempt.id,
      resultMetadata: { versionNumber: 1 },
    });

    const row = await getAuditLogRow(requestId);
    expect(row?.workspace_id).toBe(workspaceId);
    expect(row?.program_run_id).toBe(run.id);
    expect(row?.program_run_branch_id).toBe(run.activeBranchId);
    expect(row?.program_run_module_id).toBe(runModuleId);
    expect(row?.module_attempt_id).toBe(attempt.id);
    expect(row?.result_metadata).toEqual({ versionNumber: 1 });
  });

  it("swallows a duplicate request_id (unique violation) rather than throwing", async () => {
    const { actor } = await createFounderWithWorkspaceAndVenture("duplicate-request-id");
    const requestId = randomUUID();

    await recordMcpToolCall({
      requestId,
      actor,
      toolName: "get_active_context",
      outcome: "success",
      durationMs: 1,
    });

    await expect(
      recordMcpToolCall({
        requestId,
        actor,
        toolName: "get_active_context",
        outcome: "success",
        durationMs: 2,
      }),
    ).resolves.toBeUndefined();

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

    const countResult = await pool.query<{ count: string }>(
      "select count(*) as count from mcp_tool_audit_logs where request_id = $1",
      [requestId],
    );
    expect(Number(countResult.rows[0].count)).toBe(1);
  });

  it("swallows an unknown userId (FK violation) rather than throwing, and inserts nothing", async () => {
    const requestId = randomUUID();

    await expect(
      recordMcpToolCall({
        requestId,
        actor: { userId: randomUUID(), role: "founder" },
        toolName: "get_active_context",
        outcome: "success",
        durationMs: 1,
      }),
    ).resolves.toBeUndefined();

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(await getAuditLogRow(requestId)).toBeNull();
  });
});
