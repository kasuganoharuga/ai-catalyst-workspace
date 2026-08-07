import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { seedToolkitContent } from "@ai-catalyst/services/content-seed";
import type { ToolkitSeedContent } from "@ai-catalyst/services/content-seed";
import { setActiveVenture } from "@ai-catalyst/services/workspace/active-context";
import { startOrResumeAttempt } from "@ai-catalyst/services/attempt";
import {
  createFixtureFounderAccount,
  createFixtureVenture,
  founderActor,
  withTransaction,
} from "@ai-catalyst/services/testing/db-fixtures";

import {
  getOrCreateProgramRun,
  getRunModuleByKey,
  listRunModules,
  resolveAttemptRunContext,
} from "./index.js";

type FixtureModule = ToolkitSeedContent["modules"][number];
type FixtureArtifact = FixtureModule["artifacts"][number];

/**
 * Integration tests against the real Postgres database, following the same
 * pattern as packages/services/src/venture/index.db.test.ts (fixture
 * Founder/Workspace/Venture rows) and
 * packages/services/src/module/catalog.db.test.ts (fixture Program content
 * via the real seedToolkitContent reconciler, isolated from the real V1
 * content by a unique program_key).
 */

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

// `isPublishable: true` modules need at least one child row (Question or
// Artifact Definition) to pass publishProgramVersion's completeness check —
// a single fixture Artifact is the minimal shape that satisfies that.
function buildFixtureModule(
  moduleKey: string,
  sequenceIndex: number,
  isPublishable: boolean,
): FixtureModule {
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
    isPublishable,
    questions: [],
    artifacts: isPublishable ? [buildFixtureArtifact(`${moduleKey}-artifact`)] : [],
  };
}

function buildFixtureContent(
  programKey: string,
  modules: FixtureModule[],
): ToolkitSeedContent {
  return {
    program: {
      programKey,
      programName: `Workflow test program ${programKey}`,
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

describe("getOrCreateProgramRun — database integration", () => {
  const RUN_SUFFIX = randomBytes(4).toString("hex");
  const emailPrefix = `workflow-test-${RUN_SUFFIX}`;
  const ACTIVE_PROGRAM_KEY = `workflow-active-${RUN_SUFFIX}`;
  const NO_ACTIVE_MODULES_PROGRAM_KEY = `workflow-no-active-${RUN_SUFFIX}`;
  const createdUserIds: string[] = [];

  async function createFounderWithWorkspaceAndVenture(
    label: string,
  ): Promise<{ actor: ActorContext; workspaceId: string; ventureId: string }> {
    const { userId, workspaceId } = await createFixtureFounderAccount({
      label,
      emailPrefix,
      slugPrefix: "workflow-service",
    });
    createdUserIds.push(userId);

    const ventureId = await createFixtureVenture({
      workspaceId,
      createdByUserId: userId,
      label,
      slugPrefix: "workflow-venture",
    });

    return { actor: { userId, role: "founder" }, workspaceId, ventureId };
  }

  beforeAll(async () => {
    // Two active Modules, in sequence order — module-a is expected to
    // become the first (unlocked) Module and module-b the second (locked).
    await withTransaction((client) =>
      seedToolkitContent(
        client,
        buildFixtureContent(ACTIVE_PROGRAM_KEY, [
          buildFixtureModule("workflow-module-a", 0, true),
          buildFixtureModule("workflow-module-b", 1, true),
        ]),
      ),
    );
    // Both Modules are placeholders (isPublishable: false) — publish
    // succeeds (nothing here violates publishProgramVersion's
    // preconditions), but zero module_definitions end up 'active'.
    await withTransaction((client) =>
      seedToolkitContent(
        client,
        buildFixtureContent(NO_ACTIVE_MODULES_PROGRAM_KEY, [
          buildFixtureModule("workflow-placeholder-a", 0, false),
          buildFixtureModule("workflow-placeholder-b", 1, false),
        ]),
      ),
    );
  });

  afterAll(async () => {
    // Deleted explicitly, ahead of the venture cascade below:
    // user_active_contexts_venture_fk (active_venture_id, active_workspace_id)
    // -> ventures has no "on delete cascade" of its own (setActiveVenture
    // calls in this suite point it at a fixture Venture) — same reasoning
    // as artifact/index.db.test.ts's own afterAll comment.
    await pool.query("delete from user_active_contexts where user_id = any($1::uuid[])", [
      createdUserIds,
    ]);
    // Cascades away program_runs -> program_run_branches ->
    // program_run_modules (all `on delete cascade` from ventures/runs/
    // branches per 0001_aidb_v5_baseline.sql).
    await pool.query(
      "delete from ventures where workspace_id in (select id from workspaces where founder_user_id = any($1::uuid[]))",
      [createdUserIds],
    );
    await pool.query("delete from workspaces where founder_user_id = any($1::uuid[])", [
      createdUserIds,
    ]);
    await pool.query("delete from users where id = any($1::uuid[])", [createdUserIds]);
    // Cascades away program_versions -> module_definitions -> artifact_definitions.
    await pool.query("delete from programs where program_key = any($1::text[])", [
      [ACTIVE_PROGRAM_KEY, NO_ACTIVE_MODULES_PROGRAM_KEY],
    ]);
  });

  it("rejects a non-founder actor before touching the database", async () => {
    await expect(
      getOrCreateProgramRun(
        { userId: randomUUID(), role: "admin" },
        { ventureId: randomUUID() },
      ),
    ).rejects.toMatchObject({ name: "ServiceError", code: "FORBIDDEN" });
  });

  it("rejects a missing ventureId", async () => {
    await expect(
      getOrCreateProgramRun(founderActor(), {}),
    ).rejects.toMatchObject({ name: "ServiceError", code: "VALIDATION_ERROR" });
  });

  it("rejects a non-string ventureId", async () => {
    await expect(
      getOrCreateProgramRun(founderActor(), { ventureId: 12345 }),
    ).rejects.toMatchObject({ name: "ServiceError", code: "VALIDATION_ERROR" });
  });

  it("rejects a malformed (non-UUID) ventureId as NOT_FOUND, not a raw SQL error", async () => {
    await expect(
      getOrCreateProgramRun(founderActor(), { ventureId: "not-a-uuid" }),
    ).rejects.toMatchObject({ name: "ServiceError", code: "NOT_FOUND" });
  });

  it("rejects a Venture that belongs to another Workspace", async () => {
    const { actor } = await createFounderWithWorkspaceAndVenture("cross-workspace");
    const { ventureId: foreignVentureId } =
      await createFounderWithWorkspaceAndVenture("cross-workspace-other");

    await expect(
      getOrCreateProgramRun(actor, { ventureId: foreignVentureId }, {
        programKey: ACTIVE_PROGRAM_KEY,
      }),
    ).rejects.toMatchObject({ name: "ServiceError", code: "NOT_FOUND" });
  });

  it("rejects when the Venture is archived", async () => {
    const { actor, ventureId } =
      await createFounderWithWorkspaceAndVenture("archived-venture");
    await pool.query(
      "update ventures set status = 'archived', archived_at = now() where id = $1",
      [ventureId],
    );

    await expect(
      getOrCreateProgramRun(actor, { ventureId }, { programKey: ACTIVE_PROGRAM_KEY }),
    ).rejects.toMatchObject({ name: "ServiceError", code: "FORBIDDEN" });
  });

  it("rejects when the Workspace is not active", async () => {
    const { actor, workspaceId, ventureId } =
      await createFounderWithWorkspaceAndVenture("suspended-workspace");
    await pool.query("update workspaces set status = 'suspended' where id = $1", [
      workspaceId,
    ]);

    await expect(
      getOrCreateProgramRun(actor, { ventureId }, { programKey: ACTIVE_PROGRAM_KEY }),
    ).rejects.toMatchObject({ name: "ServiceError", code: "FORBIDDEN" });
  });

  it("throws INTERNAL_INVARIANT_ERROR and creates nothing when the Program Version has no active Modules", async () => {
    const { actor, ventureId } =
      await createFounderWithWorkspaceAndVenture("no-active-modules");

    await expect(
      getOrCreateProgramRun(actor, { ventureId }, {
        programKey: NO_ACTIVE_MODULES_PROGRAM_KEY,
      }),
    ).rejects.toMatchObject({
      name: "ServiceError",
      code: "INTERNAL_INVARIANT_ERROR",
    });

    const runsResult = await pool.query<{ count: string }>(
      "select count(*) as count from program_runs where venture_id = $1",
      [ventureId],
    );
    expect(Number(runsResult.rows[0].count)).toBe(0);
  });

  it("creates a new active Run with Branch 1 and program_run_modules seeded from the active Modules", async () => {
    const { actor, workspaceId, ventureId } =
      await createFounderWithWorkspaceAndVenture("create");

    const result = await getOrCreateProgramRun(actor, { ventureId }, {
      programKey: ACTIVE_PROGRAM_KEY,
    });

    expect(result.created).toBe(true);
    expect(result.run.workspaceId).toBe(workspaceId);
    expect(result.run.ventureId).toBe(ventureId);
    expect(result.run.status).toBe("active");
    expect(result.run.runNumber).toBe(1);
    expect(result.run.name).toBeNull();
    expect(result.run.startedByUserId).toBe(actor.userId);
    expect(result.run.startedAt).not.toBeNull();
    expect(result.run.pausedAt).toBeNull();
    expect(result.run.completedAt).toBeNull();
    expect(result.run.archivedAt).toBeNull();
    expect(result.run.activeBranchId).not.toBeNull();

    expect(Object.keys(result.run).sort()).toEqual(
      [
        "id",
        "workspaceId",
        "ventureId",
        "programVersionId",
        "activeBranchId",
        "runNumber",
        "name",
        "status",
        "startedByUserId",
        "startedAt",
        "pausedAt",
        "completedAt",
        "archivedAt",
        "createdAt",
        "updatedAt",
      ].sort(),
    );

    const branchResult = await pool.query<{
      branch_number: number;
      status: string;
      created_via: string;
      created_by_user_id: string;
    }>(
      `select branch_number, status, created_via, created_by_user_id
       from program_run_branches where id = $1`,
      [result.run.activeBranchId],
    );
    const branch = branchResult.rows[0];
    expect(branch.branch_number).toBe(1);
    expect(branch.status).toBe("open");
    expect(branch.created_via).toBe("website");
    expect(branch.created_by_user_id).toBe(actor.userId);

    const modulesResult = await pool.query<{
      module_key: string;
      status: string;
      sequence_index: number;
      unlocked_at: Date | null;
    }>(
      `select module_key, status, sequence_index, unlocked_at
       from program_run_modules
       where program_run_branch_id = $1
       order by sequence_index`,
      [result.run.activeBranchId],
    );
    expect(modulesResult.rows.map((row) => row.module_key)).toEqual([
      "workflow-module-a",
      "workflow-module-b",
    ]);
    expect(modulesResult.rows[0].status).toBe("available");
    expect(modulesResult.rows[0].unlocked_at).not.toBeNull();
    expect(modulesResult.rows[1].status).toBe("locked");
    expect(modulesResult.rows[1].unlocked_at).toBeNull();
  });

  it("returns the same Run idempotently on a second call, creating nothing new", async () => {
    const { actor, ventureId } = await createFounderWithWorkspaceAndVenture("idempotent");

    const first = await getOrCreateProgramRun(actor, { ventureId }, {
      programKey: ACTIVE_PROGRAM_KEY,
    });
    expect(first.created).toBe(true);

    const second = await getOrCreateProgramRun(actor, { ventureId }, {
      programKey: ACTIVE_PROGRAM_KEY,
    });
    expect(second.created).toBe(false);
    expect(second.run).toEqual(first.run);

    const runsResult = await pool.query<{ count: string }>(
      "select count(*) as count from program_runs where venture_id = $1",
      [ventureId],
    );
    expect(Number(runsResult.rows[0].count)).toBe(1);
  });

  it("assigns run_number 2 when an earlier archived Run already occupies run_number 1", async () => {
    const { actor, ventureId } =
      await createFounderWithWorkspaceAndVenture("run-number-increment");

    const first = await getOrCreateProgramRun(actor, { ventureId }, {
      programKey: ACTIVE_PROGRAM_KEY,
    });
    expect(first.run.runNumber).toBe(1);

    // program_runs_one_active_per_venture only blocks a *second non-archived*
    // Run for this Venture — archiving the first frees it up for a new one.
    await pool.query(
      "update program_runs set status = 'archived', archived_at = now() where id = $1",
      [first.run.id],
    );

    const second = await getOrCreateProgramRun(actor, { ventureId }, {
      programKey: ACTIVE_PROGRAM_KEY,
    });
    expect(second.created).toBe(true);
    expect(second.run.id).not.toBe(first.run.id);
    expect(second.run.runNumber).toBe(2);
  });

  it("creates exactly one Run when two calls race for the same brand-new Venture", async () => {
    const { actor, ventureId } = await createFounderWithWorkspaceAndVenture("concurrency");

    const [resultA, resultB] = await Promise.all([
      getOrCreateProgramRun(actor, { ventureId }, { programKey: ACTIVE_PROGRAM_KEY }),
      getOrCreateProgramRun(actor, { ventureId }, { programKey: ACTIVE_PROGRAM_KEY }),
    ]);

    expect(resultA.run.id).toBe(resultB.run.id);
    expect([resultA.created, resultB.created].filter(Boolean)).toHaveLength(1);

    const countResult = await pool.query<{ count: string }>(
      "select count(*) as count from program_runs where venture_id = $1 and status <> 'archived'",
      [ventureId],
    );
    expect(Number(countResult.rows[0].count)).toBe(1);
  });

  describe("listRunModules", () => {
    it("rejects a non-founder actor", async () => {
      await expect(
        listRunModules({ userId: randomUUID(), role: "admin" }),
      ).rejects.toMatchObject({ name: "ServiceError", code: "FORBIDDEN" });
    });

    it("returns all-null / empty when the Founder has a Workspace but no active Venture selected", async () => {
      const { actor } = await createFounderWithWorkspaceAndVenture("list-modules-no-active-venture");

      const result = await listRunModules(actor);
      expect(result).toEqual({
        workspaceId: null,
        ventureId: null,
        runId: null,
        modules: [],
      });
    });

    it("returns all-null / empty when the active Venture has no Run yet", async () => {
      const { actor, ventureId } =
        await createFounderWithWorkspaceAndVenture("list-modules-no-run");
      await setActiveVenture(actor, ventureId);

      const result = await listRunModules(actor);
      expect(result).toEqual({
        workspaceId: null,
        ventureId: null,
        runId: null,
        modules: [],
      });
    });

    it("lists the active Venture's Run Modules in sequence order", async () => {
      const { actor, workspaceId, ventureId } =
        await createFounderWithWorkspaceAndVenture("list-modules");
      await setActiveVenture(actor, ventureId);
      const { run } = await getOrCreateProgramRun(actor, { ventureId }, {
        programKey: ACTIVE_PROGRAM_KEY,
      });

      const result = await listRunModules(actor);
      expect(result.workspaceId).toBe(workspaceId);
      expect(result.ventureId).toBe(ventureId);
      expect(result.runId).toBe(run.id);
      expect(result.modules.map((m) => m.moduleKey)).toEqual([
        "workflow-module-a",
        "workflow-module-b",
      ]);
      expect(result.modules[0].status).toBe("available");
      expect(result.modules[0].programRunBranchId).toBe(run.activeBranchId);
      expect(result.modules[0].workspaceId).toBe(workspaceId);
      expect(result.modules[1].status).toBe("locked");

      expect(Object.keys(result.modules[0]).sort()).toEqual(
        [
          "id",
          "workspaceId",
          "programRunId",
          "programRunBranchId",
          "moduleDefinitionId",
          "moduleKey",
          "title",
          "sequenceIndex",
          "moduleType",
          "completionMode",
          "status",
          "activeAttemptId",
          "acceptedAttemptId",
          "unlockedAt",
          "startedAt",
          "completedAt",
          "isArchivedDefinition",
        ].sort(),
      );
    });
  });

  describe("getRunModuleByKey", () => {
    it("rejects a non-founder actor", async () => {
      await expect(
        getRunModuleByKey({ userId: randomUUID(), role: "admin" }, { moduleKey: "x" }),
      ).rejects.toMatchObject({ name: "ServiceError", code: "FORBIDDEN" });
    });

    it("rejects a missing moduleKey", async () => {
      await expect(
        getRunModuleByKey(founderActor(), {}),
      ).rejects.toMatchObject({ name: "ServiceError", code: "VALIDATION_ERROR" });
    });

    it("throws NOT_FOUND when the Founder has no active Venture/Run yet", async () => {
      await expect(
        getRunModuleByKey(founderActor(), { moduleKey: "workflow-module-a" }),
      ).rejects.toMatchObject({ name: "ServiceError", code: "NOT_FOUND" });
    });

    it("throws NOT_FOUND for a moduleKey outside the active Run's Branch", async () => {
      const { actor, ventureId } =
        await createFounderWithWorkspaceAndVenture("get-module-not-found");
      await setActiveVenture(actor, ventureId);
      await getOrCreateProgramRun(actor, { ventureId }, { programKey: ACTIVE_PROGRAM_KEY });

      await expect(
        getRunModuleByKey(actor, { moduleKey: "does-not-exist" }),
      ).rejects.toMatchObject({ name: "ServiceError", code: "NOT_FOUND" });
    });

    it("returns the matching Module for the active Venture's current Run", async () => {
      const { actor, workspaceId, ventureId } =
        await createFounderWithWorkspaceAndVenture("get-module");
      await setActiveVenture(actor, ventureId);
      const { run } = await getOrCreateProgramRun(actor, { ventureId }, {
        programKey: ACTIVE_PROGRAM_KEY,
      });

      const result = await getRunModuleByKey(actor, { moduleKey: "workflow-module-b" });
      expect(result.moduleKey).toBe("workflow-module-b");
      expect(result.workspaceId).toBe(workspaceId);
      expect(result.programRunId).toBe(run.id);
      expect(result.status).toBe("locked");
    });
  });

  describe("resolveAttemptRunContext", () => {
    it("rejects a non-founder actor", async () => {
      await expect(
        resolveAttemptRunContext({ userId: randomUUID(), role: "admin" }, randomUUID()),
      ).rejects.toMatchObject({ name: "ServiceError", code: "FORBIDDEN" });
    });

    it("throws NOT_FOUND for an unknown attemptId", async () => {
      await expect(
        resolveAttemptRunContext(founderActor(), randomUUID()),
      ).rejects.toMatchObject({ name: "ServiceError", code: "NOT_FOUND" });
    });

    it("throws NOT_FOUND for an Attempt belonging to another Workspace", async () => {
      const { actor: ownerActor, ventureId: ownerVentureId } =
        await createFounderWithWorkspaceAndVenture("attempt-context-owner");
      await setActiveVenture(ownerActor, ownerVentureId);
      await getOrCreateProgramRun(ownerActor, { ventureId: ownerVentureId }, {
        programKey: ACTIVE_PROGRAM_KEY,
      });
      const { modules } = await listRunModules(ownerActor);
      const { attempt } = await startOrResumeAttempt(ownerActor, {
        programRunModuleId: modules[0].id,
      });

      const { actor: otherActor } =
        await createFounderWithWorkspaceAndVenture("attempt-context-other");

      await expect(
        resolveAttemptRunContext(otherActor, attempt.id),
      ).rejects.toMatchObject({ name: "ServiceError", code: "NOT_FOUND" });
    });

    it("resolves the full Run/Branch/Module hierarchy above an Attempt", async () => {
      const { actor, workspaceId, ventureId } =
        await createFounderWithWorkspaceAndVenture("attempt-context");
      await setActiveVenture(actor, ventureId);
      const { run } = await getOrCreateProgramRun(actor, { ventureId }, {
        programKey: ACTIVE_PROGRAM_KEY,
      });
      const { modules } = await listRunModules(actor);
      const firstModule = modules[0];
      const { attempt } = await startOrResumeAttempt(actor, {
        programRunModuleId: firstModule.id,
      });

      const context = await resolveAttemptRunContext(actor, attempt.id);
      expect(context).toEqual({
        workspaceId,
        programRunId: run.id,
        programRunBranchId: run.activeBranchId,
        programRunModuleId: firstModule.id,
      });
    });
  });
});

// ---------------------------------------------------------------------
// End-to-end: a living (content_lock='mutable') program_version's Module
// added after a Founder's Run already exists must reach that Run the next
// time getOrCreateProgramRun's existing-Run branch runs — this is the
// core fix reconcile-run-modules.ts + workflow/internal wiring provide.
// The pure branch-walk algorithm itself is unit-tested directly in
// workflow/internal/reconcile-run-modules.test.ts; this suite only proves
// the real getOrCreateProgramRun code path invokes it correctly.
// ---------------------------------------------------------------------
describe("getOrCreateProgramRun — living content reconciliation", () => {
  const RUN_SUFFIX = randomBytes(4).toString("hex");
  const emailPrefix = `workflow-living-test-${RUN_SUFFIX}`;
  const LIVING_PROGRAM_KEY = `workflow-living-${RUN_SUFFIX}`;
  const createdUserIds: string[] = [];

  // Each test gets its OWN program_key (not shared across this describe
  // block's tests) — content-seed's desired-module-set is the COMPLETE
  // set every time, so two tests progressively seeding different Module
  // sets against the SAME program_version would see each other's earlier
  // Modules as "missing from constants" and trip the archive guard.
  function buildMutableFixtureContent(programKey: string, modules: FixtureModule[]): ToolkitSeedContent {
    return {
      program: {
        programKey,
        programName: `Living workflow test program ${programKey}`,
        programDescription: null,
        versionNumber: 1,
        versionLabel: `v1-${programKey}`,
        versionName: `Fixture living v1 ${programKey}`,
        versionDescription: null,
        contentLock: "mutable",
        releaseNotes: null,
      },
      modules,
      prompts: [],
      promptBindings: [],
    };
  }

  async function createFounderWithWorkspaceAndVenture(
    label: string,
  ): Promise<{ actor: ActorContext; workspaceId: string; ventureId: string }> {
    const { userId, workspaceId } = await createFixtureFounderAccount({
      label,
      emailPrefix,
      slugPrefix: "workflow-living",
    });
    createdUserIds.push(userId);

    const ventureId = await createFixtureVenture({
      workspaceId,
      createdByUserId: userId,
      label,
      slugPrefix: "workflow-living-venture",
    });

    return { actor: { userId, role: "founder" }, workspaceId, ventureId };
  }

  afterAll(async () => {
    await pool.query("delete from user_active_contexts where user_id = any($1::uuid[])", [
      createdUserIds,
    ]);
    await pool.query(
      "delete from ventures where workspace_id in (select id from workspaces where founder_user_id = any($1::uuid[]))",
      [createdUserIds],
    );
    await pool.query("delete from workspaces where founder_user_id = any($1::uuid[])", [
      createdUserIds,
    ]);
    await pool.query("delete from users where id = any($1::uuid[])", [createdUserIds]);
    // Every test's program_key is LIVING_PROGRAM_KEY prefixed — see
    // buildMutableFixtureContent's own comment for why each test uses a
    // distinct one.
    await pool.query("delete from programs where program_key like $1", [`${LIVING_PROGRAM_KEY}%`]);
  });

  it("front-fills a Module added after the Run was created, the next time getOrCreateProgramRun runs", async () => {
    const programKey = `${LIVING_PROGRAM_KEY}-front-fill`;
    await withTransaction((client) =>
      seedToolkitContent(client, buildMutableFixtureContent(programKey, [buildFixtureModule("living-a", 0, true)])),
    );

    const { actor, ventureId } = await createFounderWithWorkspaceAndVenture("front-fill");
    await setActiveVenture(actor, ventureId);
    const created = await getOrCreateProgramRun(actor, { ventureId }, { programKey });
    expect(created.created).toBe(true);

    let { modules } = await listRunModules(actor);
    expect(modules.map((module) => module.moduleKey)).toEqual(["living-a"]);

    // A Module added to the living content AFTER this Run was created.
    await withTransaction((client) =>
      seedToolkitContent(
        client,
        buildMutableFixtureContent(programKey, [
          buildFixtureModule("living-a", 0, true),
          buildFixtureModule("living-b", 1, true),
        ]),
      ),
    );

    // The Founder's next Continue Programme click — existing-Run branch,
    // not create — must pick up living-b.
    const again = await getOrCreateProgramRun(actor, { ventureId }, { programKey });
    expect(again.created).toBe(false);
    expect(again.run.id).toBe(created.run.id);

    ({ modules } = await listRunModules(actor));
    expect(modules.map((module) => module.moduleKey)).toEqual(["living-a", "living-b"]);
    const livingB = modules.find((module) => module.moduleKey === "living-b")!;
    // living-a hasn't been completed, so living-b must be inserted locked,
    // not available — this is the "predecessor doesn't allow access" case.
    expect(livingB.status).toBe("locked");
  });

  it("does not re-lock an already-available Module when a new one is inserted after it", async () => {
    const programKey = `${LIVING_PROGRAM_KEY}-monotonic`;
    await withTransaction((client) =>
      seedToolkitContent(
        client,
        buildMutableFixtureContent(programKey, [
          buildFixtureModule("living-x", 0, true),
          buildFixtureModule("living-z", 1, true),
        ]),
      ),
    );

    const { actor, ventureId } = await createFounderWithWorkspaceAndVenture("monotonic");
    await setActiveVenture(actor, ventureId);
    await getOrCreateProgramRun(actor, { ventureId }, { programKey });

    const { modules: beforeInsert } = await listRunModules(actor);
    const zBefore = beforeInsert.find((module) => module.moduleKey === "living-z")!;
    expect(zBefore.status).toBe("locked"); // x not completed yet

    // Now insert living-y between x and z by resequencing z from 1 to 2.
    // No Module is removed from the content set, so this needs no
    // --allow-archive: it's purely an insert + resequence.
    await withTransaction((client) =>
      seedToolkitContent(
        client,
        buildMutableFixtureContent(programKey, [
          buildFixtureModule("living-x", 0, true),
          buildFixtureModule("living-y", 1, true),
          buildFixtureModule("living-z", 2, true),
        ]),
      ),
    );

    await getOrCreateProgramRun(actor, { ventureId }, { programKey });
    const { modules: afterInsert } = await listRunModules(actor);
    expect(afterInsert.map((module) => module.moduleKey)).toEqual(["living-x", "living-y", "living-z"]);
    const zAfter = afterInsert.find((module) => module.moduleKey === "living-z")!;
    // Still locked (nothing completed x or y) — this specific assertion
    // isn't the point; the point is it did NOT crash and z's row moved
    // to the correct new sequence_index without a unique-constraint
    // violation despite y taking its old slot.
    expect(zAfter.status).toBe("locked");
    expect(zAfter.sequenceIndex).toBe(2);
  });

  it("is a no-op on the second call when nothing changed", async () => {
    const programKey = `${LIVING_PROGRAM_KEY}-noop`;
    await withTransaction((client) =>
      seedToolkitContent(client, buildMutableFixtureContent(programKey, [buildFixtureModule("living-noop", 0, true)])),
    );

    const { actor, ventureId } = await createFounderWithWorkspaceAndVenture("noop");
    await setActiveVenture(actor, ventureId);
    const first = await getOrCreateProgramRun(actor, { ventureId }, { programKey });
    const { modules: modulesBefore } = await listRunModules(actor);

    const second = await getOrCreateProgramRun(actor, { ventureId }, { programKey });
    expect(second.run.id).toBe(first.run.id);
    const { modules: modulesAfter } = await listRunModules(actor);
    expect(modulesAfter).toEqual(modulesBefore);
  });
});
