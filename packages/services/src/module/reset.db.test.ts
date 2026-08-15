import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { seedToolkitContent } from "@ai-catalyst/services/content-seed";
import type { ToolkitSeedContent } from "@ai-catalyst/services/content-seed";
import { getOrCreateProgramRun } from "@ai-catalyst/services/workflow";
import {
  saveFounderResponse,
  startOrResumeAttempt,
} from "@ai-catalyst/services/attempt";
import { saveArtifactSubmission } from "@ai-catalyst/services/artifact";
import {
  completeModuleAttempt,
  confirmModuleCompletion,
} from "@ai-catalyst/services/module/completion";
import { savePrepExtract } from "@ai-catalyst/services/prep";
import {
  createFixtureFounderAccount,
  createFixtureVenture,
  withTransaction,
} from "@ai-catalyst/services/testing/db-fixtures";
import type { Validator } from "../artifact/internal/validators/types.js";

import { resetModuleProgress } from "./reset.js";

/**
 * Integration tests against the real Postgres database, following the
 * same three-module fixture pattern as completion.db.test.ts: a fixture
 * Program (Setup + two standard Modules, isolated program_key) seeded via
 * the real seedToolkitContent reconciler, then real
 * getOrCreateProgramRun/startOrResumeAttempt/completeModuleAttempt/
 * confirmModuleCompletion calls to reach a real completed Module 0 that
 * has genuinely unlocked Module 1 — resetModuleProgress is exercised
 * against that real state, not a hand-built one.
 */

type FixtureModule = ToolkitSeedContent["modules"][number];
type FixtureQuestion = FixtureModule["questions"][number];
type FixtureArtifact = FixtureModule["artifacts"][number];

const REQUIRED_MARKER = "REQUIRED_MARKER";
const FIXTURE_VALIDATOR_KEY = "reset-fixture-validator-v1";
const MODULE_0_KEY = "reset-module-00-setup";
const MODULE_1_KEY = "reset-module-01-standard";
const MODULE_2_KEY = "reset-module-02-standard";
const SETUP_ARTIFACT_KEY = "reset_setup_summary";
const MODULE_1_ARTIFACT_KEY = "reset_module_1_artifact";
const MODULE_2_ARTIFACT_KEY = "reset_module_2_artifact";

const fixtureValidator: Validator = {
  validatorKey: FIXTURE_VALIDATOR_KEY,
  validatorVersion: "1.0.0-fixture",
  runDraftCheck(ctx) {
    const passed = ctx.content.includes(REQUIRED_MARKER);
    return {
      checks: [{ key: "has_required_marker", passed }],
      issues: passed ? [] : [`Content is missing "${REQUIRED_MARKER}".`],
      warnings: [],
      passed,
      score: passed ? 100 : 0,
    };
  },
  runOfficialCheck(ctx) {
    return fixtureValidator.runDraftCheck(ctx);
  },
};

function webFounderActor(userId: string): ActorContext {
  return { userId, role: "founder", source: "web" };
}

function buildModule0(): FixtureModule {
  const artifact: FixtureArtifact = {
    artifactKey: SETUP_ARTIFACT_KEY,
    sequenceIndex: 1,
    name: "Fixture Setup Summary",
    description: null,
    isRequired: true,
    artifactType: "document",
    sourceFormat: "markdown",
    outputFormat: "markdown",
    requiredFilename: "Setup-Summary.md",
    rendererKey: null,
    validatorKey: null,
    allowedMimeTypes: ["text/markdown"],
    maxFileSizeBytes: 262_144,
    maxFiles: 1,
    validationConfig: {},
    outputConfig: {},
  };
  return {
    moduleKey: MODULE_0_KEY,
    sequenceIndex: 0,
    title: "Fixture Setup",
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

function buildStandardModule(
  moduleKey: string,
  sequenceIndex: number,
  artifactKey: string,
): FixtureModule {
  const question: FixtureQuestion = {
    questionKey: "fixture_question",
    sequenceIndex: 1,
    questionGroup: null,
    questionText: "Fixture question?",
    helpText: null,
    placeholderText: null,
    responseType: "short_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  };
  const artifact: FixtureArtifact = {
    artifactKey,
    sequenceIndex: 1,
    name: `Fixture Artifact ${moduleKey}`,
    description: null,
    isRequired: true,
    artifactType: "document",
    sourceFormat: "markdown",
    outputFormat: "markdown",
    requiredFilename: "artifact.md",
    rendererKey: null,
    validatorKey: FIXTURE_VALIDATOR_KEY,
    allowedMimeTypes: ["text/markdown"],
    maxFileSizeBytes: 262_144,
    maxFiles: 1,
    validationConfig: {},
    outputConfig: {},
  };
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
    questions: [question],
    artifacts: [artifact],
  };
}

function buildFixtureContent(programKey: string): ToolkitSeedContent {
  return {
    program: {
      programKey,
      programName: `Reset service test program ${programKey}`,
      programDescription: null,
      versionNumber: 1,
      versionLabel: `v1-${programKey}`,
      versionName: `Fixture v1 ${programKey}`,
      versionDescription: null,
      contentLock: "frozen",
      releaseNotes: null,
    },
    modules: [
      buildModule0(),
      buildStandardModule(MODULE_1_KEY, 1, MODULE_1_ARTIFACT_KEY),
      buildStandardModule(MODULE_2_KEY, 2, MODULE_2_ARTIFACT_KEY),
    ],
    prompts: [],
    promptBindings: [],
  };
}

describe("resetModuleProgress — database integration", () => {
  const RUN_SUFFIX = randomBytes(4).toString("hex");
  const emailPrefix = `reset-test-${RUN_SUFFIX}`;
  const PROGRAM_KEY = `reset-service-${RUN_SUFFIX}`;
  const createdUserIds: string[] = [];
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAppEnv = process.env.APP_ENV;

  async function createRunWithModules(label: string): Promise<{
    actor: ActorContext;
    module0Id: string;
    module1Id: string;
    module2Id: string;
  }> {
    const { userId, workspaceId } = await createFixtureFounderAccount({
      label,
      emailPrefix,
      slugPrefix: "reset-service",
    });
    createdUserIds.push(userId);
    const ventureId = await createFixtureVenture({
      workspaceId,
      createdByUserId: userId,
      label,
      slugPrefix: "reset-service-venture",
    });
    const actor = webFounderActor(userId);
    const { run } = await getOrCreateProgramRun(
      actor,
      { ventureId },
      { programKey: PROGRAM_KEY },
    );

    const modules = await pool.query<{ id: string; module_key: string }>(
      `select id, module_key from program_run_modules
       where program_run_branch_id = $1
       order by sequence_index`,
      [run.activeBranchId],
    );
    const byKey = (key: string) =>
      modules.rows.find((row) => row.module_key === key)?.id;
    const module0Id = byKey(MODULE_0_KEY);
    const module1Id = byKey(MODULE_1_KEY);
    const module2Id = byKey(MODULE_2_KEY);
    if (!module0Id || !module1Id || !module2Id) {
      throw new Error(
        "Fixture program_run_modules were not seeded as expected.",
      );
    }
    return { actor, module0Id, module1Id, module2Id };
  }

  async function completeAndConfirm(
    actor: ActorContext,
    programRunModuleId: string,
    artifactKey: string,
  ) {
    const { attempt } = await startOrResumeAttempt(actor, {
      programRunModuleId,
    });
    if (artifactKey !== SETUP_ARTIFACT_KEY) {
      await saveFounderResponse(actor, {
        attemptId: attempt.id,
        questionKey: "fixture_question",
        value: "answer",
      });
      await saveArtifactSubmission(
        actor,
        {
          attemptId: attempt.id,
          artifactKey,
          content: `# Fixture\n\n${REQUIRED_MARKER}\n`,
        },
        { validators: { [FIXTURE_VALIDATOR_KEY]: fixtureValidator } },
      );
    }
    const result = await completeModuleAttempt(
      actor,
      { attemptId: attempt.id },
      { validators: { [FIXTURE_VALIDATOR_KEY]: fixtureValidator } },
    );
    expect(result.passed).toBe(true);
    await confirmModuleCompletion(actor, { programRunModuleId });
    return attempt.id;
  }

  async function getRunModuleRow(runModuleId: string) {
    const result = await pool.query<{
      id: string;
      status: string;
      active_attempt_id: string | null;
      accepted_attempt_id: string | null;
      completed_by_user_id: string | null;
      unlocked_at: Date | null;
    }>(
      `select id, status, active_attempt_id, accepted_attempt_id,
              completed_by_user_id, unlocked_at
       from program_run_modules where id = $1`,
      [runModuleId],
    );
    return result.rows[0];
  }

  async function countAttempts(runModuleId: string): Promise<number> {
    const result = await pool.query<{ count: string }>(
      `select count(*)::text as count from module_attempts
       where program_run_module_id = $1`,
      [runModuleId],
    );
    return Number(result.rows[0].count);
  }

  beforeAll(async () => {
    await withTransaction((client) =>
      seedToolkitContent(client, buildFixtureContent(PROGRAM_KEY)),
    );
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalAppEnv === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = originalAppEnv;
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
    await pool.query("delete from programs where program_key = $1", [
      PROGRAM_KEY,
    ]);
  });

  it("wipes the target module's attempt and re-locks the module it had unlocked", async () => {
    const { actor, module0Id, module1Id, module2Id } =
      await createRunWithModules("basic");

    await completeAndConfirm(actor, module0Id, SETUP_ARTIFACT_KEY);
    await completeAndConfirm(actor, module1Id, MODULE_1_ARTIFACT_KEY);

    const module2Before = await getRunModuleRow(module2Id);
    expect(module2Before.status).toBe("available");
    expect(await countAttempts(module1Id)).toBe(1);

    const result = await resetModuleProgress(actor, module1Id);
    expect(result.resetModuleIds.sort()).toEqual([module1Id, module2Id].sort());
    expect(result.attemptsDeleted).toBe(1);

    const module0After = await getRunModuleRow(module0Id);
    expect(module0After.status).toBe("completed"); // untouched — before the target

    const module1After = await getRunModuleRow(module1Id);
    expect(module1After.status).toBe("available");
    expect(module1After.active_attempt_id).toBeNull();
    expect(module1After.accepted_attempt_id).toBeNull();
    expect(module1After.completed_by_user_id).toBeNull();
    expect(await countAttempts(module1Id)).toBe(0);

    const module2After = await getRunModuleRow(module2Id);
    expect(module2After.status).toBe("locked");
    expect(module2After.unlocked_at).toBeNull();
  });

  it("deletes prep documents for the reset module", async () => {
    const { actor, module1Id } = await createRunWithModules("prep");
    await savePrepExtract(actor, {
      programRunModuleId: module1Id,
      filename: "shared-in-chat.pdf",
      extractedText: "Some transcribed content.",
    });

    const before = await pool.query<{ count: string }>(
      `select count(*)::text as count from module_prep_documents
       where program_run_module_id = $1`,
      [module1Id],
    );
    expect(Number(before.rows[0].count)).toBe(1);

    await resetModuleProgress(actor, module1Id);

    const after = await pool.query<{ count: string }>(
      `select count(*)::text as count from module_prep_documents
       where program_run_module_id = $1`,
      [module1Id],
    );
    expect(Number(after.rows[0].count)).toBe(0);
  });

  it("detaches module_events from the deleted attempt instead of deleting the audit row", async () => {
    const { actor, module0Id } = await createRunWithModules("events");
    const attemptId = await completeAndConfirm(
      actor,
      module0Id,
      SETUP_ARTIFACT_KEY,
    );

    const before = await pool.query<{ count: string }>(
      `select count(*)::text as count from module_events
       where module_attempt_id = $1`,
      [attemptId],
    );
    expect(Number(before.rows[0].count)).toBeGreaterThan(0);

    await resetModuleProgress(actor, module0Id);

    const stillAttached = await pool.query<{ count: string }>(
      `select count(*)::text as count from module_events
       where module_attempt_id = $1`,
      [attemptId],
    );
    expect(Number(stillAttached.rows[0].count)).toBe(0);

    const survivingRows = await pool.query<{ count: string }>(
      `select count(*)::text as count from module_events
       where program_run_module_id = $1`,
      [module0Id],
    );
    expect(Number(survivingRows.rows[0].count)).toBeGreaterThan(0);
  });

  it("refuses when APP_ENV is production", async () => {
    const { actor, module1Id } = await createRunWithModules("prod-guard");
    process.env.APP_ENV = "production";
    process.env.NODE_ENV = "production";

    await expect(resetModuleProgress(actor, module1Id)).rejects.toMatchObject({
      name: "ServiceError",
      code: "FORBIDDEN",
    });
  });

  it("allows a reset when APP_ENV is staging even if NODE_ENV is production", async () => {
    const { actor, module1Id } = await createRunWithModules("staging-guard");
    process.env.APP_ENV = "staging";
    process.env.NODE_ENV = "production";

    const result = await resetModuleProgress(actor, module1Id);
    expect(result.resetModuleIds).toContain(module1Id);
  });

  it("treats an unknown run module id as not found", async () => {
    const { actor } = await createRunWithModules("missing");
    await expect(resetModuleProgress(actor, randomUUID())).rejects.toThrow(
      /Module not found/,
    );
  });

  it("never resets another workspace's module", async () => {
    const owner = await createRunWithModules("owner");
    const intruder = await createRunWithModules("intruder");

    await expect(
      resetModuleProgress(intruder.actor, owner.module1Id),
    ).rejects.toThrow(/Module not found/);
  });
});
