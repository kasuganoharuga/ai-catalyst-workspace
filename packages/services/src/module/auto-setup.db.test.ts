import { randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { seedToolkitContent } from "@ai-catalyst/services/content-seed";
import type { ToolkitSeedContent } from "@ai-catalyst/services/content-seed";
import { getOrCreateProgramRun } from "@ai-catalyst/services/workflow";
import { startOrResumeAttempt } from "@ai-catalyst/services/attempt";

import { autoCompleteSetupModule } from "./auto-setup.js";

/**
 * Integration tests for the server-side Module 0 completion that replaced
 * the Founder-facing setup step. Same fixture pattern as
 * completion.db.test.ts: a fixture Program seeded through the real
 * reconciler, then real Service calls throughout.
 *
 * What matters here is not that the underlying Attempt machinery works —
 * completion.db.test.ts covers that — but that this runs on a path the
 * Founder can re-enter at will (refresh, second tab, clicking Continue
 * twice) without producing a second Attempt, a second Artifact version, or
 * an error.
 */

type FixtureModule = ToolkitSeedContent["modules"][number];
type FixtureArtifact = FixtureModule["artifacts"][number];

const SETUP_MODULE_KEY = "auto-setup-module-00-setup";
const NEXT_MODULE_KEY = "auto-setup-module-01-decision";
const SETUP_ARTIFACT_KEY = "setup_summary";

function webFounderActor(userId: string): ActorContext {
  return { userId, role: "founder", source: "web" };
}

async function withTransaction<T>(
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

function buildSetupModule(): FixtureModule {
  const artifact: FixtureArtifact = {
    artifactKey: SETUP_ARTIFACT_KEY,
    sequenceIndex: 1,
    name: "Fixture Setup Summary",
    description: null,
    isRequired: true,
    artifactType: "document",
    sourceFormat: "markdown",
    outputFormat: "markdown",
    requiredFilename: "Founder-Toolkit-Setup-Summary.md",
    rendererKey: null,
    // No validator: Module 0 is checked operationally (auth, MCP, storage
    // read/write/hash), not on the content of the Markdown — same as the
    // real content in content-seed/content/module-0.ts.
    validatorKey: null,
    allowedMimeTypes: ["text/markdown"],
    maxFileSizeBytes: 262_144,
    maxFiles: 1,
    validationConfig: {},
    outputConfig: {},
  };
  return {
    moduleKey: SETUP_MODULE_KEY,
    sequenceIndex: 0,
    title: "Fixture Setup and Connection",
    subtitle: null,
    description: null,
    objective: null,
    moduleType: "setup",
    isRequired: true,
    allowRevisions: true,
    completionMode: "system",
    estimatedMinutes: null,
    isPublishable: true,
    questions: [],
    artifacts: [artifact],
  };
}

// publishProgramVersion refuses to publish a publishable Module with
// neither questions nor artifacts, so these carry one nominal artifact.
// Nothing in this suite submits against them — they exist to be unlocked.
function buildStandardModule(
  moduleKey: string,
  sequenceIndex: number,
): FixtureModule {
  const artifact: FixtureArtifact = {
    artifactKey: "fixture_output",
    sequenceIndex: 1,
    name: `Fixture Output ${sequenceIndex}`,
    description: null,
    isRequired: true,
    artifactType: "document",
    sourceFormat: "markdown",
    outputFormat: "markdown",
    requiredFilename: "fixture-output.md",
    rendererKey: null,
    validatorKey: null,
    allowedMimeTypes: ["text/markdown"],
    maxFileSizeBytes: 262_144,
    maxFiles: 1,
    validationConfig: {},
    outputConfig: {},
  };
  return {
    moduleKey,
    sequenceIndex,
    title: `Fixture Standard ${sequenceIndex}`,
    subtitle: null,
    description: null,
    objective: null,
    moduleType: "standard",
    isRequired: true,
    allowRevisions: true,
    completionMode: "artifact_and_confirmation",
    estimatedMinutes: null,
    isPublishable: true,
    questions: [],
    artifacts: [artifact],
  };
}

function buildContent(
  programKey: string,
  modules: FixtureModule[],
): ToolkitSeedContent {
  return {
    program: {
      programKey,
      programName: `Auto setup test program ${programKey}`,
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

describe("autoCompleteSetupModule — database integration", () => {
  const RUN_SUFFIX = randomBytes(4).toString("hex");
  const emailPrefix = `auto-setup-test-${RUN_SUFFIX}`;
  // Two fixture Programs: one shaped like the real content (setup module
  // first), one deliberately without a setup module at all.
  const PROGRAM_KEY = `auto-setup-service-${RUN_SUFFIX}`;
  const NO_SETUP_PROGRAM_KEY = `auto-setup-none-${RUN_SUFFIX}`;
  const createdUserIds: string[] = [];

  async function createFounder(label: string): Promise<{
    actor: ActorContext;
    ventureId: string;
  }> {
    const email = `${emailPrefix}-${label}-${randomUUID()}@example.com`;
    const userResult = await pool.query<{ id: string }>(
      "insert into users (name, email, role) values ($1, $2, 'founder') returning id",
      [`${emailPrefix}-${label}`, email],
    );
    createdUserIds.push(userResult.rows[0].id);
    const actor = webFounderActor(userResult.rows[0].id);

    const workspaceResult = await pool.query<{ id: string }>(
      `insert into workspaces (founder_user_id, name, slug)
       values ($1, $2, $3) returning id`,
      [actor.userId, `Fixture ${label}`, `auto-setup-${label}-${randomUUID()}`],
    );
    const ventureResult = await pool.query<{ id: string }>(
      `insert into ventures (workspace_id, created_by_user_id, name, slug)
       values ($1, $2, $3, $4) returning id`,
      [
        workspaceResult.rows[0].id,
        actor.userId,
        `Fixture Venture ${label}`,
        `auto-setup-venture-${label}-${randomUUID()}`,
      ],
    );
    return { actor, ventureId: ventureResult.rows[0].id };
  }

  async function createRun(label: string, programKey = PROGRAM_KEY) {
    const { actor, ventureId } = await createFounder(label);
    const { run } = await getOrCreateProgramRun(
      actor,
      { ventureId },
      { programKey },
    );
    return { actor, runId: run.id, branchId: run.activeBranchId };
  }

  async function getRunModule(branchId: string | null, moduleKey: string) {
    const result = await pool.query<{
      id: string;
      status: string;
      active_attempt_id: string | null;
      accepted_attempt_id: string | null;
    }>(
      `select id, status, active_attempt_id, accepted_attempt_id
       from program_run_modules
       where program_run_branch_id = $1 and module_key = $2`,
      [branchId, moduleKey],
    );
    return result.rows[0];
  }

  async function countAttempts(runModuleId: string): Promise<number> {
    const result = await pool.query<{ count: string }>(
      "select count(*)::text as count from module_attempts where program_run_module_id = $1",
      [runModuleId],
    );
    return Number(result.rows[0].count);
  }

  async function countArtifactVersions(runModuleId: string): Promise<number> {
    const result = await pool.query<{ count: string }>(
      `select count(*)::text as count from artifact_submissions s
       join module_attempts a on a.id = s.module_attempt_id
       where a.program_run_module_id = $1`,
      [runModuleId],
    );
    return Number(result.rows[0].count);
  }

  beforeAll(async () => {
    await withTransaction((client) =>
      seedToolkitContent(
        client,
        buildContent(PROGRAM_KEY, [
          buildSetupModule(),
          buildStandardModule(NEXT_MODULE_KEY, 1),
        ]),
      ),
    );
    await withTransaction((client) =>
      seedToolkitContent(
        client,
        buildContent(NO_SETUP_PROGRAM_KEY, [
          buildStandardModule("auto-setup-none-module-00", 0),
          buildStandardModule("auto-setup-none-module-01", 1),
        ]),
      ),
    );
  });

  afterAll(async () => {
    await pool.query(
      "delete from artifact_submissions where workspace_id in (select id from workspaces where founder_user_id = any($1::uuid[]))",
      [createdUserIds],
    );
    await pool.query(
      "delete from ventures where workspace_id in (select id from workspaces where founder_user_id = any($1::uuid[]))",
      [createdUserIds],
    );
    await pool.query(
      "delete from workspaces where founder_user_id = any($1::uuid[])",
      [createdUserIds],
    );
    await pool.query("delete from users where id = any($1::uuid[])", [
      createdUserIds,
    ]);
    await pool.query("delete from programs where program_key = any($1::text[])", [
      [PROGRAM_KEY, NO_SETUP_PROGRAM_KEY],
    ]);
  });

  it("completes the setup module and unlocks the next one", async () => {
    const { actor, runId, branchId } = await createRun("completes");

    const result = await autoCompleteSetupModule(actor, { programRunId: runId });

    expect(result.status).toBe("completed");
    if (result.status !== "completed") return;
    expect(result.nextModuleUnlocked?.moduleKey).toBe(NEXT_MODULE_KEY);

    const setupModule = await getRunModule(branchId, SETUP_MODULE_KEY);
    expect(setupModule.status).toBe("completed");
    expect(setupModule.accepted_attempt_id).not.toBeNull();

    // The whole point of hiding it: the Founder's first real module is
    // open without them having done anything.
    const nextModule = await getRunModule(branchId, NEXT_MODULE_KEY);
    expect(nextModule.status).toBe("available");
  });

  it("saves the system-generated setup summary exactly once", async () => {
    const { actor, runId, branchId } = await createRun("artifact");

    await autoCompleteSetupModule(actor, { programRunId: runId });

    const setupModule = await getRunModule(branchId, SETUP_MODULE_KEY);
    expect(await countArtifactVersions(setupModule.id)).toBe(1);
  });

  // This runs on the "open my programme" path, which a Founder can hit
  // repeatedly: a refresh, a second tab, or a double-clicked Continue.
  it("is idempotent across repeated calls", async () => {
    const { actor, runId, branchId } = await createRun("idempotent");

    const first = await autoCompleteSetupModule(actor, { programRunId: runId });
    const second = await autoCompleteSetupModule(actor, { programRunId: runId });
    const third = await autoCompleteSetupModule(actor, { programRunId: runId });

    expect(first.status).toBe("completed");
    expect(second.status).toBe("already_completed");
    expect(third.status).toBe("already_completed");

    const setupModule = await getRunModule(branchId, SETUP_MODULE_KEY);
    expect(await countAttempts(setupModule.id)).toBe(1);
    expect(await countArtifactVersions(setupModule.id)).toBe(1);
  });

  // A Founder who opened Module 0 before this change shipped already has a
  // live Attempt. Starting a second one would trip the one-live-Attempt
  // partial unique index.
  it("resumes an Attempt that is already open rather than starting a second", async () => {
    const { actor, runId, branchId } = await createRun("resumes");
    const setupBefore = await getRunModule(branchId, SETUP_MODULE_KEY);
    const { attempt } = await startOrResumeAttempt(actor, {
      programRunModuleId: setupBefore.id,
    });

    const result = await autoCompleteSetupModule(actor, { programRunId: runId });

    expect(result.status).toBe("completed");
    const setupAfter = await getRunModule(branchId, SETUP_MODULE_KEY);
    expect(setupAfter.accepted_attempt_id).toBe(attempt.id);
    expect(await countAttempts(setupAfter.id)).toBe(1);
  });

  it("reports not_applicable when the program has no setup module", async () => {
    const { actor, runId } = await createRun("no-setup", NO_SETUP_PROGRAM_KEY);

    const result = await autoCompleteSetupModule(actor, { programRunId: runId });

    expect(result.status).toBe("not_applicable");
  });
});
