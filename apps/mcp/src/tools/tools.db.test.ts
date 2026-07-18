import { randomBytes } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type { ToolkitSeedContent } from "@ai-catalyst/services/content-seed";
import { getOrCreateProgramRun } from "@ai-catalyst/services/workflow";
import { setActiveVenture } from "@ai-catalyst/services/workspace/active-context";
import { startOrResumeAttempt } from "@ai-catalyst/services/attempt";
import {
  cleanupFixtureAccounts,
  createFixtureFounderAccount,
  createFixtureVenture,
  getFixtureModuleAttemptStatus,
  getFixtureRunModuleIds,
  getLatestFixtureMcpToolAuditLogRow,
  seedFixtureProgram,
} from "@ai-catalyst/services/testing/db-fixtures";

import { createMcpApp, type CreateMcpAppOptions } from "../server.js";

/**
 * Integration tests against the real Postgres database and the real
 * Express app (via supertest), following the same fixture pattern as
 * packages/services' own *.db.test.ts suites: a fixture Program seeded
 * via the real seedToolkitContent reconciler, a real Founder/Workspace/
 * Venture/Run built with the real Service functions (a Run's creation is
 * the website's job — no PR 2.7 Tool creates one), then every PR 2.7
 * MCP Tool exercised end-to-end through POST /mcp, asserting both the
 * JSON-RPC response and the resulting `mcp_tool_audit_logs` row.
 *
 * Fixture setup/teardown/assertion queries are routed through
 * packages/services/src/testing/db-fixtures.ts rather than importing
 * `pool` from `@ai-catalyst/db` here directly — apps/mcp must go through
 * packages/services instead of touching the database directly, per
 * .dependency-cruiser.js's only-web-may-import-db-pool rule.
 */

const ALLOWED_HOSTS = ["127.0.0.1", "localhost"];
const ALLOWED_ORIGINS: string[] = [];
const RESOURCE_URL = "http://localhost:8787/mcp";
const AUTHORIZATION_SERVER_URL = "http://localhost:3000";

type FixtureModule = ToolkitSeedContent["modules"][number];
type FixtureQuestion = FixtureModule["questions"][number];
type FixtureArtifact = FixtureModule["artifacts"][number];

function buildFixtureQuestions(): FixtureQuestion[] {
  return [
    {
      questionKey: "q1",
      sequenceIndex: 1,
      questionGroup: null,
      questionText: "First question?",
      helpText: null,
      placeholderText: null,
      responseType: "short_text",
      isRequired: true,
      allowSkip: false,
      options: [],
      conditions: {},
    },
  ];
}

function buildFixtureArtifact(artifactKey: string): FixtureArtifact {
  return {
    artifactKey,
    sequenceIndex: 1,
    name: `Fixture artifact ${artifactKey}`,
    description: null,
    isRequired: true,
    artifactType: "document",
    sourceFormat: "markdown",
    outputFormat: "markdown",
    requiredFilename: `${artifactKey}.md`,
    rendererKey: null,
    validatorKey: null,
    allowedMimeTypes: ["text/markdown"],
    maxFileSizeBytes: 262_144,
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
    completionMode: "artifact_and_confirmation",
    estimatedMinutes: null,
    isPublishable: true,
    questions: buildFixtureQuestions(),
    artifacts: [buildFixtureArtifact("verdict")],
  };
}

function buildFixtureContent(programKey: string, modules: FixtureModule[]): ToolkitSeedContent {
  return {
    program: {
      programKey,
      programName: `MCP tools test program ${programKey}`,
      programDescription: null,
      versionNumber: 1,
      versionLabel: `v1-${programKey}`,
      versionName: `Fixture v1 ${programKey}`,
      versionDescription: null,
      releaseNotes: null,
    },
    modules,
    prompts: [],
    promptBindings: [],
  };
}

const VALID_TOKEN = "valid-fixture-token";

function buildAppForActor(actor: ActorContext, overrides: Partial<CreateMcpAppOptions> = {}) {
  return createMcpApp({
    allowedHosts: ALLOWED_HOSTS,
    allowedOrigins: ALLOWED_ORIGINS,
    resourceUrl: RESOURCE_URL,
    authorizationServerUrl: AUTHORIZATION_SERVER_URL,
    verifyBearer: async (rawToken: unknown) => {
      if (rawToken === VALID_TOKEN) {
        return actor;
      }
      const { ServiceError } = await import("@ai-catalyst/services/errors");
      throw new ServiceError("UNAUTHENTICATED", "Invalid bearer token.");
    },
    ...overrides,
  });
}

interface ToolCallResult {
  status: number;
  isError: boolean;
  data: unknown;
}

async function callTool(
  actor: ActorContext,
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<ToolCallResult> {
  const res = await request(buildAppForActor(actor))
    .post("/mcp")
    .set("Host", "localhost")
    .set("Accept", "application/json, text/event-stream")
    .set("Authorization", `Bearer ${VALID_TOKEN}`)
    .send({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    });

  const result = res.body.result as { content: { type: string; text: string }[]; isError?: boolean } | undefined;
  const text = result?.content?.[0]?.text;
  let data: unknown = undefined;
  if (typeof text === "string") {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { status: res.status, isError: Boolean(result?.isError), data };
}

const getLatestAuditLogRow = getLatestFixtureMcpToolAuditLogRow;

describe("PR 2.7 MCP Tools — database integration", () => {
  const RUN_SUFFIX = randomBytes(4).toString("hex");
  const emailPrefix = `mcp-tools-test-${RUN_SUFFIX}`;
  const PROGRAM_KEY = `mcp-tools-${RUN_SUFFIX}`;
  const createdUserIds: string[] = [];

  async function createFounderWithActiveRun(label: string): Promise<{
    actor: ActorContext;
    workspaceId: string;
    ventureId: string;
    runModuleId: string;
  }> {
    const { userId, workspaceId } = await createFixtureFounderAccount({ label, emailPrefix });
    createdUserIds.push(userId);
    const ventureId = await createFixtureVenture({
      workspaceId,
      createdByUserId: userId,
      label,
    });

    const websiteActor: ActorContext = { userId, role: "founder", source: "web" };
    await setActiveVenture(websiteActor, ventureId);
    const { run } = await getOrCreateProgramRun(
      websiteActor,
      { ventureId },
      { programKey: PROGRAM_KEY },
    );

    const [runModuleId] = await getFixtureRunModuleIds(run.activeBranchId!);

    const mcpActor: ActorContext = {
      userId,
      role: "founder",
      source: "mcp",
      scopes: ["mcp:connect"],
      clientId: "test-client-id",
    };

    return { actor: mcpActor, workspaceId, ventureId, runModuleId };
  }

  beforeAll(async () => {
    await seedFixtureProgram(buildFixtureContent(PROGRAM_KEY, [buildFixtureModule("mcp-module-a", 0)]));
  });

  afterAll(async () => {
    await cleanupFixtureAccounts({ userIds: createdUserIds, programKey: PROGRAM_KEY });
  });

  describe("read tools", () => {
    it("get_active_context resolves the Founder's Workspace/Venture and records a success audit row", async () => {
      const { actor, workspaceId, ventureId } = await createFounderWithActiveRun("active-context");

      const result = await callTool(actor, "get_active_context");

      expect(result.status).toBe(200);
      expect(result.isError).toBe(false);
      expect(result.data).toEqual({ workspaceId, ventureId });

      const auditRow = await getLatestAuditLogRow(actor.userId, "get_active_context");
      expect(auditRow?.outcome).toBe("success");
      expect(auditRow?.workspace_id).toBe(workspaceId);
      expect(auditRow?.request_metadata).toMatchObject({
        clientId: "test-client-id",
        scopes: ["mcp:connect"],
      });
    });

    it("list_modules lists the Founder's current Run Modules and records a success audit row", async () => {
      const { actor, workspaceId } = await createFounderWithActiveRun("list-modules");

      const result = await callTool(actor, "list_modules");

      expect(result.isError).toBe(false);
      const data = result.data as { workspaceId: string; modules: { moduleKey: string }[] };
      expect(data.workspaceId).toBe(workspaceId);
      expect(data.modules.map((m) => m.moduleKey)).toEqual(["mcp-module-a"]);

      const auditRow = await getLatestAuditLogRow(actor.userId, "list_modules");
      expect(auditRow?.outcome).toBe("success");
      expect(auditRow?.result_metadata).toEqual({ moduleCount: 1 });
    });

    it("get_module_status returns the Run-scoped Module summary and records the full hierarchy", async () => {
      const { actor, runModuleId } = await createFounderWithActiveRun("module-status");

      const result = await callTool(actor, "get_module_status", { moduleKey: "mcp-module-a" });

      expect(result.isError).toBe(false);
      const data = result.data as { moduleKey: string; id: string; status: string };
      expect(data.moduleKey).toBe("mcp-module-a");
      expect(data.id).toBe(runModuleId);
      expect(data.status).toBe("available");

      const auditRow = await getLatestAuditLogRow(actor.userId, "get_module_status");
      expect(auditRow?.outcome).toBe("success");
      expect(auditRow?.program_run_module_id).toBe(runModuleId);
    });

    it("get_module_status returns an isError result for a missing moduleKey, rejected by the MCP SDK's own inputSchema before the handler (and its audit write) ever runs", async () => {
      const { actor } = await createFounderWithActiveRun("module-status-invalid");

      const result = await callTool(actor, "get_module_status", {});

      expect(result.isError).toBe(true);
      expect(await getLatestAuditLogRow(actor.userId, "get_module_status")).toBeNull();
    });

    it("get_module_status returns a denied/NOT_FOUND isError result for an unknown moduleKey", async () => {
      const { actor } = await createFounderWithActiveRun("module-status-not-found");

      const result = await callTool(actor, "get_module_status", { moduleKey: "does-not-exist" });

      expect(result.isError).toBe(true);

      const auditRow = await getLatestAuditLogRow(actor.userId, "get_module_status");
      expect(auditRow?.outcome).toBe("denied");
      expect(auditRow?.error_code).toBe("NOT_FOUND");
    });

    it("get_module_context returns Questions with a resumeQuestionKey and records the Module hierarchy", async () => {
      const { actor, runModuleId } = await createFounderWithActiveRun("module-context");

      const result = await callTool(actor, "get_module_context", { moduleKey: "mcp-module-a" });

      expect(result.isError).toBe(false);
      const data = result.data as {
        runModule: { id: string };
        resumeQuestionKey: string | null;
        questions: { questionKey: string }[];
      };
      expect(data.runModule.id).toBe(runModuleId);
      expect(data.resumeQuestionKey).toBe("q1");
      expect(data.questions.map((q) => q.questionKey)).toEqual(["q1"]);

      const auditRow = await getLatestAuditLogRow(actor.userId, "get_module_context");
      expect(auditRow?.program_run_module_id).toBe(runModuleId);
      expect(auditRow?.result_metadata).toEqual({ moduleKey: "mcp-module-a", resumeQuestionKey: "q1" });
    });
  });

  describe("write tools + get_artifact", () => {
    it("save_founder_input persists an answer and records the full Attempt hierarchy", async () => {
      const { actor, runModuleId, workspaceId } = await createFounderWithActiveRun("save-input");
      const { attempt } = await startOrResumeAttempt(actor, { programRunModuleId: runModuleId });

      const result = await callTool(actor, "save_founder_input", {
        attemptId: attempt.id,
        questionKey: "q1",
        value: "My answer via MCP.",
      });

      expect(result.isError).toBe(false);
      const data = result.data as { questionKey: string; responseStatus: string; answerText: string };
      expect(data.questionKey).toBe("q1");
      expect(data.responseStatus).toBe("answered");
      expect(data.answerText).toBe("My answer via MCP.");

      const auditRow = await getLatestAuditLogRow(actor.userId, "save_founder_input");
      expect(auditRow?.outcome).toBe("success");
      expect(auditRow?.workspace_id).toBe(workspaceId);
      expect(auditRow?.program_run_module_id).toBe(runModuleId);
      expect(auditRow?.module_attempt_id).toBe(attempt.id);
      expect(auditRow?.result_metadata).toEqual({ questionKey: "q1", responseStatus: "answered" });
    });

    it("save_artifact stores content via StorageService and get_artifact reads the same content back", async () => {
      const { actor, runModuleId } = await createFounderWithActiveRun("save-and-get-artifact");
      const { attempt } = await startOrResumeAttempt(actor, { programRunModuleId: runModuleId });
      const content = "# Verdict\n\nSaved through the MCP save_artifact Tool.\n";

      const saveResult = await callTool(actor, "save_artifact", {
        attemptId: attempt.id,
        artifactKey: "verdict",
        content,
      });

      expect(saveResult.isError).toBe(false);
      const saveData = saveResult.data as { versionNumber: number; status: string };
      expect(saveData.versionNumber).toBe(1);
      expect(saveData.status).toBe("draft");

      const saveAuditRow = await getLatestAuditLogRow(actor.userId, "save_artifact");
      expect(saveAuditRow?.outcome).toBe("success");
      expect(saveAuditRow?.module_attempt_id).toBe(attempt.id);
      expect(saveAuditRow?.result_metadata).toEqual({
        artifactKey: "verdict",
        versionNumber: 1,
        status: "draft",
      });

      const getResult = await callTool(actor, "get_artifact", {
        attemptId: attempt.id,
        artifactKey: "verdict",
      });

      expect(getResult.isError).toBe(false);
      const getData = getResult.data as { submission: { versionNumber: number }; content: string };
      expect(getData.content).toBe(content);
      expect(getData.submission.versionNumber).toBe(1);

      const getAuditRow = await getLatestAuditLogRow(actor.userId, "get_artifact");
      expect(getAuditRow?.module_attempt_id).toBe(attempt.id);
      expect(getAuditRow?.result_metadata).toEqual({
        artifactKey: "verdict",
        found: true,
        versionNumber: 1,
      });
    });

    it("get_artifact returns a null result (not an error) when the Artifact was never saved", async () => {
      const { actor, runModuleId } = await createFounderWithActiveRun("get-artifact-never-saved");
      const { attempt } = await startOrResumeAttempt(actor, { programRunModuleId: runModuleId });

      const result = await callTool(actor, "get_artifact", {
        attemptId: attempt.id,
        artifactKey: "verdict",
      });

      expect(result.isError).toBe(false);
      expect(result.data).toBeNull();

      const auditRow = await getLatestAuditLogRow(actor.userId, "get_artifact");
      expect(auditRow?.outcome).toBe("success");
      expect(auditRow?.result_metadata).toEqual({
        artifactKey: "verdict",
        found: false,
        versionNumber: null,
      });
    });

    it("complete_module submits the Attempt for review and never triggers Official Validation", async () => {
      const { actor, runModuleId } = await createFounderWithActiveRun("complete-module");
      const { attempt } = await startOrResumeAttempt(actor, { programRunModuleId: runModuleId });

      const result = await callTool(actor, "complete_module", { attemptId: attempt.id });

      expect(result.isError).toBe(false);
      const data = result.data as { id: string; status: string };
      expect(data.id).toBe(attempt.id);
      expect(data.status).toBe("submitted");

      expect(await getFixtureModuleAttemptStatus(attempt.id)).toBe("submitted");

      const auditRow = await getLatestAuditLogRow(actor.userId, "complete_module");
      expect(auditRow?.outcome).toBe("success");
      expect(auditRow?.module_attempt_id).toBe(attempt.id);
      expect(auditRow?.result_metadata).toEqual({ status: "submitted" });
    });

    it("save_founder_input on a cross-Workspace attemptId returns a denied/NOT_FOUND isError result", async () => {
      const { actor: ownerActor, runModuleId } = await createFounderWithActiveRun(
        "cross-workspace-owner",
      );
      const { attempt } = await startOrResumeAttempt(ownerActor, {
        programRunModuleId: runModuleId,
      });
      const { actor: otherActor } = await createFounderWithActiveRun("cross-workspace-caller");

      const result = await callTool(otherActor, "save_founder_input", {
        attemptId: attempt.id,
        questionKey: "q1",
        value: "Should not be allowed.",
      });

      expect(result.isError).toBe(true);

      const auditRow = await getLatestAuditLogRow(otherActor.userId, "save_founder_input");
      expect(auditRow?.outcome).toBe("denied");
      expect(auditRow?.error_code).toBe("NOT_FOUND");
      expect(auditRow?.workspace_id).toBeNull();
      expect(auditRow?.module_attempt_id).toBeNull();
    });
  });
});
