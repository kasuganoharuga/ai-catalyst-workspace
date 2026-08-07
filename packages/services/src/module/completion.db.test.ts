import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
  createFixtureFounderAccount,
  createFixtureVenture,
  withTransaction,
} from "@ai-catalyst/services/testing/db-fixtures";
import type { Validator } from "../artifact/internal/validators/types.js";

import {
  completeModuleAttempt,
  confirmModuleCompletion,
} from "./completion.js";

/**
 * Integration tests against the real Postgres database, following the
 * same fixture pattern as attempt/index.db.test.ts and
 * artifact/index.db.test.ts: a fixture Program (module-0-shaped Module +
 * module-1-shaped Module, isolated program_key) seeded via the real
 * seedToolkitContent reconciler, then real getOrCreateProgramRun /
 * startOrResumeAttempt / saveFounderResponse / saveArtifactSubmission
 * calls to reach a real, submittable Attempt for each — this suite is
 * about completeModuleAttempt's own orchestration, not about re-testing
 * submitAttempt/runOfficialValidation's own already-covered internals.
 */

type FixtureModule = ToolkitSeedContent["modules"][number];
type FixtureQuestion = FixtureModule["questions"][number];
type FixtureArtifact = FixtureModule["artifacts"][number];

const REQUIRED_MARKER = "REQUIRED_MARKER";
const FIXTURE_VALIDATOR_KEY = "completion-fixture-validator-v1";
const MODULE_0_KEY = "completion-module-00-setup";
const MODULE_1_KEY = "completion-module-01-decision";
const SETUP_ARTIFACT_KEY = "setup_summary";
const DECISION_ARTIFACT_KEY = "verdict";

// Fixture Validator only checks for a required marker. completeModuleAttempt
// no longer branches on Founder decision (Proceed/Pivot/Kill all stay at
// ready_for_review); decision Responses here are for realism only.
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

function adminActor(userId: string): ActorContext {
  return { userId, role: "admin" };
}

const DECISION_OPTIONS = [
  { value: "proceed", label: "Proceed" },
  { value: "pivot", label: "Pivot" },
  { value: "kill", label: "Kill" },
];

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
    requiredFilename: "Founder-Toolkit-Setup-Summary.md",
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

function buildModule1(): FixtureModule {
  const question: FixtureQuestion = {
    questionKey: "final_decision",
    sequenceIndex: 1,
    questionGroup: null,
    questionText: "Final decision?",
    helpText: null,
    placeholderText: null,
    responseType: "single_choice",
    isRequired: true,
    allowSkip: false,
    options: DECISION_OPTIONS,
    conditions: {},
  };
  const artifact: FixtureArtifact = {
    artifactKey: DECISION_ARTIFACT_KEY,
    sequenceIndex: 1,
    name: "Fixture Verdict",
    description: null,
    isRequired: true,
    artifactType: "document",
    sourceFormat: "markdown",
    outputFormat: "markdown",
    requiredFilename: "verdict.md",
    rendererKey: null,
    validatorKey: FIXTURE_VALIDATOR_KEY,
    allowedMimeTypes: ["text/markdown"],
    maxFileSizeBytes: 262_144,
    maxFiles: 1,
    validationConfig: {},
    outputConfig: {},
  };
  return {
    moduleKey: MODULE_1_KEY,
    sequenceIndex: 1,
    title: "Fixture Pressure Test",
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
      programName: `Completion service test program ${programKey}`,
      programDescription: null,
      versionNumber: 1,
      versionLabel: `v1-${programKey}`,
      versionName: `Fixture v1 ${programKey}`,
      versionDescription: null,
      contentLock: "frozen",
      releaseNotes: null,
    },
    modules: [buildModule0(), buildModule1()],
    prompts: [],
    promptBindings: [],
  };
}

describe("completeModuleAttempt — database integration", () => {
  const RUN_SUFFIX = randomBytes(4).toString("hex");
  const emailPrefix = `completion-test-${RUN_SUFFIX}`;
  const PROGRAM_KEY = `completion-service-${RUN_SUFFIX}`;
  const createdUserIds: string[] = [];

  async function createFounderWithWorkspaceAndVenture(
    label: string,
  ): Promise<{ actor: ActorContext; workspaceId: string; ventureId: string }> {
    const { userId, workspaceId } = await createFixtureFounderAccount({
      label,
      emailPrefix,
      slugPrefix: "completion-service",
    });
    createdUserIds.push(userId);

    const ventureId = await createFixtureVenture({
      workspaceId,
      createdByUserId: userId,
      label,
      slugPrefix: "completion-service-venture",
    });

    return { actor: webFounderActor(userId), workspaceId, ventureId };
  }

  async function createRunWithModules(label: string): Promise<{
    actor: ActorContext;
    workspaceId: string;
    module0Id: string;
    module1Id: string;
  }> {
    const { actor, workspaceId, ventureId } =
      await createFounderWithWorkspaceAndVenture(label);
    const result = await getOrCreateProgramRun(
      actor,
      { ventureId },
      { programKey: PROGRAM_KEY },
    );

    const modulesResult = await pool.query<{ id: string; module_key: string }>(
      `select id, module_key from program_run_modules
       where program_run_branch_id = $1
       order by sequence_index`,
      [result.run.activeBranchId],
    );
    const module0 = modulesResult.rows.find(
      (row) => row.module_key === MODULE_0_KEY,
    );
    const module1 = modulesResult.rows.find(
      (row) => row.module_key === MODULE_1_KEY,
    );
    if (!module0 || !module1) {
      throw new Error(
        "Fixture program_run_modules were not seeded as expected.",
      );
    }

    return { actor, workspaceId, module0Id: module0.id, module1Id: module1.id };
  }

  async function getAttemptRow(attemptId: string) {
    const result = await pool.query<{
      id: string;
      status: string;
      accepted_by_user_id: string | null;
      accepted_at: Date | null;
      cancelled_at: Date | null;
    }>(
      `select id, status, accepted_by_user_id, accepted_at, cancelled_at
       from module_attempts where id = $1`,
      [attemptId],
    );
    return result.rows[0];
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
      `select id, status, active_attempt_id, accepted_attempt_id, completed_by_user_id, unlocked_at
       from program_run_modules where id = $1`,
      [runModuleId],
    );
    return result.rows[0];
  }

  async function getEventTypesForModule(
    runModuleId: string,
  ): Promise<
    { event_type: string; actor_type: string; source_provider: string | null }[]
  > {
    const result = await pool.query<{
      event_type: string;
      actor_type: string;
      source_provider: string | null;
    }>(
      `select event_type, actor_type, source_provider from module_events
       where program_run_module_id = $1
       order by created_at`,
      [runModuleId],
    );
    return result.rows;
  }

  async function completeModule0(label: string) {
    const fixture = await createRunWithModules(label);
    const { attempt } = await startOrResumeAttempt(fixture.actor, {
      programRunModuleId: fixture.module0Id,
    });
    const result = await completeModuleAttempt(fixture.actor, {
      attemptId: attempt.id,
    });
    return { fixture, attempt, result };
  }

  // Module 1 is only reachable once the Founder has confirmed Module 0 —
  // `complete_module` alone no longer unlocks it. Tests that need to work
  // on Module 1 go through this rather than completeModule0.
  async function completeAndConfirmModule0(label: string) {
    const outcome = await completeModule0(label);
    await confirmModuleCompletion(outcome.fixture.actor, {
      programRunModuleId: outcome.fixture.module0Id,
    });
    return outcome;
  }

  beforeAll(async () => {
    await withTransaction((client) =>
      seedToolkitContent(client, buildFixtureContent(PROGRAM_KEY)),
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
    await pool.query("delete from programs where program_key = $1", [
      PROGRAM_KEY,
    ]);
  });

  // The MCP side stops short of completing the Module: unlocking is the
  // Founder's own action on the website (confirmModuleCompletion).
  it("leaves a completion_mode='system' Module awaiting confirmation instead of unlocking the next one", async () => {
    const { fixture, attempt, result } =
      await completeModule0("system-complete");

    expect(result.passed).toBe(true);
    expect(result.moduleCompleted).toBe(false);
    expect(result.awaitingConfirmation).toBe(true);
    expect(result.validationErrors).toEqual([]);
    expect(result.nextModuleUnlocked).toBeNull();
    expect(result.attempt.status).toBe("ready_for_review");

    const attemptRow = await getAttemptRow(attempt.id);
    expect(attemptRow.status).toBe("ready_for_review");
    expect(attemptRow.accepted_at).toBeNull();

    const module0Row = await getRunModuleRow(fixture.module0Id);
    expect(module0Row.status).toBe("in_progress");
    expect(module0Row.accepted_attempt_id).toBeNull();

    // The whole point: the next Module stays shut until a human says so.
    const module1Row = await getRunModuleRow(fixture.module1Id);
    expect(module1Row.status).toBe("locked");
    expect(module1Row.unlocked_at).toBeNull();

    const submission = await pool.query<{
      status: string;
      version_number: number;
    }>(
      `select status, version_number from artifact_submissions where module_attempt_id = $1`,
      [attempt.id],
    );
    expect(submission.rows).toHaveLength(1);
    expect(submission.rows[0].version_number).toBe(1);

    const module0Events = await getEventTypesForModule(fixture.module0Id);
    expect(module0Events.map((row) => row.event_type)).toEqual([
      "attempt_started",
      "artifact_uploaded",
      "attempt_submitted",
      "validation_started",
      "validation_passed",
    ]);
  });

  it("completes the Module and unlocks the next one when the Founder confirms", async () => {
    const { fixture, attempt } = await completeModule0("system-confirm");

    const confirmation = await confirmModuleCompletion(fixture.actor, {
      programRunModuleId: fixture.module0Id,
    });

    expect(confirmation.justConfirmed).toBe(true);
    expect(confirmation.nextModuleUnlocked).toMatchObject({
      id: fixture.module1Id,
      moduleKey: MODULE_1_KEY,
    });

    const attemptRow = await getAttemptRow(attempt.id);
    expect(attemptRow.status).toBe("accepted");
    expect(attemptRow.accepted_at).not.toBeNull();
    // Attributed to the Founder who confirmed, not to a system actor.
    expect(attemptRow.accepted_by_user_id).toBe(fixture.actor.userId);

    const module0Row = await getRunModuleRow(fixture.module0Id);
    expect(module0Row.status).toBe("completed");
    expect(module0Row.completed_by_user_id).toBe(fixture.actor.userId);
    expect(module0Row.accepted_attempt_id).toBe(attempt.id);
    expect(module0Row.active_attempt_id).toBeNull();

    const module1Row = await getRunModuleRow(fixture.module1Id);
    expect(module1Row.status).toBe("available");
    expect(module1Row.unlocked_at).not.toBeNull();

    const module0Events = await getEventTypesForModule(fixture.module0Id);
    expect(module0Events.map((row) => row.event_type)).toEqual([
      "attempt_started",
      "artifact_uploaded",
      "attempt_submitted",
      "validation_started",
      "validation_passed",
      "attempt_accepted",
      "module_completed",
    ]);
    // 'user' rather than 'system': a person confirmed this, and the
    // event log should say so.
    const acceptedEvent = module0Events.find(
      (row) => row.event_type === "attempt_accepted",
    );
    expect(acceptedEvent?.actor_type).toBe("user");
    expect(acceptedEvent?.source_provider).toBe("website");
  });

  it("is idempotent when the Founder confirms twice", async () => {
    const { fixture } = await completeModule0("system-confirm-twice");

    await confirmModuleCompletion(fixture.actor, {
      programRunModuleId: fixture.module0Id,
    });
    const replay = await confirmModuleCompletion(fixture.actor, {
      programRunModuleId: fixture.module0Id,
    });

    expect(replay.justConfirmed).toBe(false);
    expect(replay.nextModuleUnlocked).toBeNull();

    const module0Row = await getRunModuleRow(fixture.module0Id);
    expect(module0Row.status).toBe("completed");
  });

  it("refuses to confirm a Module whose Attempt hasn't passed validation", async () => {
    const fixture = await createRunWithModules("confirm-too-early");
    await startOrResumeAttempt(fixture.actor, {
      programRunModuleId: fixture.module0Id,
    });

    await expect(
      confirmModuleCompletion(fixture.actor, {
        programRunModuleId: fixture.module0Id,
      }),
    ).rejects.toMatchObject({ code: "MODULE_NOT_READY_FOR_CONFIRMATION" });

    const module1Row = await getRunModuleRow(fixture.module1Id);
    expect(module1Row.status).toBe("locked");
  });

  it("refuses to confirm a Module that has never been started", async () => {
    const fixture = await createRunWithModules("confirm-not-started");

    await expect(
      confirmModuleCompletion(fixture.actor, {
        programRunModuleId: fixture.module0Id,
      }),
    ).rejects.toMatchObject({ code: "MODULE_NOT_READY_FOR_CONFIRMATION" });
  });

  it("is idempotent for an already-accepted Attempt", async () => {
    const { attempt, fixture } = await completeModule0("system-idempotent");
    await confirmModuleCompletion(fixture.actor, {
      programRunModuleId: fixture.module0Id,
    });

    const replay = await completeModuleAttempt(fixture.actor, {
      attemptId: attempt.id,
    });

    expect(replay.moduleCompleted).toBe(true);
    expect(replay.attempt.status).toBe("accepted");
    expect(replay.nextModuleUnlocked).toBeNull();

    const submissionVersions = await pool.query<{ version_number: number }>(
      `select version_number from artifact_submissions where module_attempt_id = $1`,
      [attempt.id],
    );
    expect(submissionVersions.rows).toHaveLength(1);
    expect(submissionVersions.rows[0].version_number).toBe(1);
  });

  it("leaves a 'proceed' decision Attempt ready_for_review with no further action", async () => {
    const { fixture } = await completeAndConfirmModule0("proceed");
    const { attempt: module1Attempt } = await startOrResumeAttempt(
      fixture.actor,
      {
        programRunModuleId: fixture.module1Id,
      },
    );
    await saveFounderResponse(fixture.actor, {
      attemptId: module1Attempt.id,
      questionKey: "final_decision",
      value: "proceed",
    });
    await saveArtifactSubmission(
      fixture.actor,
      {
        attemptId: module1Attempt.id,
        artifactKey: DECISION_ARTIFACT_KEY,
        content: `# Verdict\n\n${REQUIRED_MARKER}\n`,
      },
      { validators: { [FIXTURE_VALIDATOR_KEY]: fixtureValidator } },
    );

    const result = await completeModuleAttempt(
      fixture.actor,
      { attemptId: module1Attempt.id },
      {
        validators: { [FIXTURE_VALIDATOR_KEY]: fixtureValidator },
      },
    );

    expect(result.passed).toBe(true);
    expect(result.moduleCompleted).toBe(false);
    expect(result.awaitingConfirmation).toBe(true);
    expect(result.validationErrors).toEqual([]);
    expect(result.attempt.status).toBe("ready_for_review");

    const module1Row = await getRunModuleRow(fixture.module1Id);
    expect(module1Row.status).toBe("in_progress");
    expect(module1Row.active_attempt_id).toBe(module1Attempt.id);
  });

  it("leaves a 'pivot' decision Attempt ready_for_review without auto-retry", async () => {
    const { fixture } = await completeAndConfirmModule0("pivot");
    const { attempt: module1Attempt } = await startOrResumeAttempt(
      fixture.actor,
      {
        programRunModuleId: fixture.module1Id,
      },
    );
    await saveFounderResponse(fixture.actor, {
      attemptId: module1Attempt.id,
      questionKey: "final_decision",
      value: "pivot",
    });
    await saveArtifactSubmission(
      fixture.actor,
      {
        attemptId: module1Attempt.id,
        artifactKey: DECISION_ARTIFACT_KEY,
        content: `# Verdict\n\n${REQUIRED_MARKER}\n`,
      },
      { validators: { [FIXTURE_VALIDATOR_KEY]: fixtureValidator } },
    );

    const result = await completeModuleAttempt(
      fixture.actor,
      { attemptId: module1Attempt.id },
      {
        validators: { [FIXTURE_VALIDATOR_KEY]: fixtureValidator },
      },
    );

    expect(result.passed).toBe(true);
    expect(result.moduleCompleted).toBe(false);
    expect(result.awaitingConfirmation).toBe(true);
    expect(result.attempt.status).toBe("ready_for_review");

    const attemptRow = await getAttemptRow(module1Attempt.id);
    expect(attemptRow.status).toBe("ready_for_review");
    expect(attemptRow.cancelled_at).toBeNull();

    const module1Row = await getRunModuleRow(fixture.module1Id);
    expect(module1Row.status).toBe("in_progress");
    expect(module1Row.active_attempt_id).toBe(module1Attempt.id);

    const cancelledEvent = await pool.query<{ event_type: string }>(
      `select event_type from module_events
       where module_attempt_id = $1 and event_type = 'attempt_cancelled'`,
      [module1Attempt.id],
    );
    expect(cancelledEvent.rows).toHaveLength(0);
  });

  it("returns passed:false with missingArtifactKeys and validationErrors when the required Artifact was never submitted", async () => {
    const { fixture } = await completeAndConfirmModule0("validation-failed");
    const { attempt: module1Attempt } = await startOrResumeAttempt(
      fixture.actor,
      {
        programRunModuleId: fixture.module1Id,
      },
    );
    await saveFounderResponse(fixture.actor, {
      attemptId: module1Attempt.id,
      questionKey: "final_decision",
      value: "proceed",
    });

    const result = await completeModuleAttempt(
      fixture.actor,
      { attemptId: module1Attempt.id },
      {
        validators: { [FIXTURE_VALIDATOR_KEY]: fixtureValidator },
      },
    );

    expect(result.passed).toBe(false);
    expect(result.moduleCompleted).toBe(false);
    expect(result.missingArtifactKeys).toEqual([DECISION_ARTIFACT_KEY]);
    expect(result.validationErrors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: `missing_artifact:${DECISION_ARTIFACT_KEY}`,
        }),
      ]),
    );
    expect(result.attempt.status).toBe("validation_failed");
  });

  it("rejects a non-founder actor", async () => {
    const { fixture, attempt } = await completeModule0("forbidden");
    await expect(
      completeModuleAttempt(adminActor(fixture.actor.userId), {
        attemptId: attempt.id,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
