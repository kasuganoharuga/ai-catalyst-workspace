import { randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { seedToolkitContent } from "@ai-catalyst/services/content-seed";
import type { ToolkitSeedContent } from "@ai-catalyst/services/content-seed";
import { getOrCreateProgramRun } from "@ai-catalyst/services/workflow";
import { setActiveVenture } from "@ai-catalyst/services/workspace/active-context";
import { saveArtifactSubmission } from "@ai-catalyst/services/artifact";
import { saveFounderResponse, startOrResumeAttempt } from "@ai-catalyst/services/attempt";

import { getModuleContext } from "./context.js";

/**
 * Integration tests against the real Postgres database, following the
 * same fixture pattern as artifact/index.db.test.ts and
 * workflow/index.db.test.ts: a fixture Program seeded via the real
 * seedToolkitContent reconciler, real getOrCreateProgramRun /
 * startOrResumeAttempt / saveFounderResponse / saveArtifactSubmission
 * calls to build up real state, then getModuleContext's own aggregation
 * exercised against it.
 */

type FixtureModule = ToolkitSeedContent["modules"][number];
type FixtureQuestion = FixtureModule["questions"][number];
type FixtureArtifact = FixtureModule["artifacts"][number];

const DECISION_OPTIONS = [
  { value: "proceed", label: "Proceed" },
  { value: "pivot", label: "Pivot" },
];

function buildFixtureQuestions(): FixtureQuestion[] {
  return [
    {
      questionKey: "first_question",
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
    {
      questionKey: "final_decision",
      sequenceIndex: 2,
      questionGroup: null,
      questionText: "Final decision?",
      helpText: null,
      placeholderText: null,
      responseType: "single_choice",
      isRequired: true,
      allowSkip: false,
      options: DECISION_OPTIONS,
      conditions: {},
    },
  ];
}

function buildFixtureArtifact(artifactKey: string, sequenceIndex: number): FixtureArtifact {
  return {
    artifactKey,
    sequenceIndex,
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

function buildFixtureModule(
  moduleKey: string,
  sequenceIndex: number,
  questions: FixtureQuestion[],
  artifacts: FixtureArtifact[],
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
    completionMode: "artifact_and_confirmation",
    estimatedMinutes: null,
    isPublishable: true,
    questions,
    artifacts,
  };
}

function buildFixtureContent(programKey: string, modules: FixtureModule[]): ToolkitSeedContent {
  return {
    program: {
      programKey,
      programName: `Module context test program ${programKey}`,
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

describe("getModuleContext — database integration", () => {
  const RUN_SUFFIX = randomBytes(4).toString("hex");
  const emailPrefix = `module-context-test-${RUN_SUFFIX}`;
  const PROGRAM_KEY = `module-context-${RUN_SUFFIX}`;
  const createdUserIds: string[] = [];

  async function createFounderWithActiveVenture(
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
      [actor.userId, `Fixture ${label}`, `module-context-${label}-${randomUUID()}`],
    );
    const workspaceId = workspaceResult.rows[0].id;

    const ventureResult = await pool.query<{ id: string }>(
      `insert into ventures (workspace_id, created_by_user_id, name, slug)
       values ($1, $2, $3, $4) returning id`,
      [
        workspaceId,
        actor.userId,
        `Fixture Venture ${label}`,
        `module-context-venture-${label}-${randomUUID()}`,
      ],
    );
    const ventureId = ventureResult.rows[0].id;

    await setActiveVenture(actor, ventureId);
    await getOrCreateProgramRun(actor, { ventureId }, { programKey: PROGRAM_KEY });

    return { actor, workspaceId, ventureId };
  }

  beforeAll(async () => {
    await withTransaction((client) =>
      seedToolkitContent(
        client,
        buildFixtureContent(PROGRAM_KEY, [
          buildFixtureModule(
            "context-module-a",
            0,
            buildFixtureQuestions(),
            [buildFixtureArtifact("verdict", 1)],
          ),
          // isPublishable requires at least one child row
          // (publishProgramVersion's own completeness check) — a single
          // fixture Artifact (never referenced by this suite's own
          // assertions) is the minimal shape that satisfies it while
          // keeping this Module's Questions empty.
          buildFixtureModule(
            "context-module-b",
            1,
            [],
            [buildFixtureArtifact("sibling-artifact", 1)],
          ),
        ]),
      ),
    );
  });

  afterAll(async () => {
    // Deleted explicitly, ahead of the venture cascade below —
    // user_active_contexts_venture_fk has no "on delete cascade" of its
    // own (every fixture Founder here calls setActiveVenture).
    await pool.query("delete from user_active_contexts where user_id = any($1::uuid[])", [
      createdUserIds,
    ]);
    // Deleted explicitly too — artifact_submissions_run_module_definition_fk
    // (program_run_module_id, module_definition_id) -> program_run_modules
    // has no "on delete cascade" of its own (same as
    // artifact/index.db.test.ts's own afterAll comment).
    await pool.query(
      "delete from artifact_submissions where workspace_id in (select id from workspaces where founder_user_id = any($1::uuid[]))",
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

  it("rejects a non-founder actor", async () => {
    await expect(
      getModuleContext(
        { userId: randomUUID(), role: "admin" },
        { moduleKey: "context-module-a" },
      ),
    ).rejects.toMatchObject({ name: "ServiceError", code: "FORBIDDEN" });
  });

  it("propagates NOT_FOUND from getRunModuleByKey for an unknown moduleKey", async () => {
    const { actor } = await createFounderWithActiveVenture("not-found");

    await expect(
      getModuleContext(actor, { moduleKey: "does-not-exist" }),
    ).rejects.toMatchObject({ name: "ServiceError", code: "NOT_FOUND" });
  });

  it("returns every active Question with a null responseStatus and resumes at the first Question when no Attempt has started", async () => {
    const { actor } = await createFounderWithActiveVenture("no-attempt");

    const context = await getModuleContext(actor, { moduleKey: "context-module-a" });

    expect(context.runModule.moduleKey).toBe("context-module-a");
    expect(context.activeAttempt).toBeNull();
    expect(context.displayAttempt).toBeNull();
    expect(context.prompts).toEqual([]);
    expect(context.resumeQuestionKey).toBe("first_question");
    expect(context.questions.map((q) => q.questionKey)).toEqual([
      "first_question",
      "final_decision",
    ]);
    expect(context.questions.every((q) => q.responseStatus === null)).toBe(true);
    expect(context.questions.every((q) => q.answerText === null)).toBe(true);
    expect(context.artifacts).toEqual([
      {
        artifactKey: "verdict",
        name: "Fixture artifact verdict",
        isRequired: true,
        requiredFilename: "verdict.md",
        latestSubmission: null,
      },
    ]);
  });

  it("returns the active Attempt once one has started", async () => {
    const { actor } = await createFounderWithActiveVenture("with-attempt");
    const runModule = await getModuleContext(actor, { moduleKey: "context-module-a" });
    const { attempt } = await startOrResumeAttempt(actor, {
      programRunModuleId: runModule.runModule.id,
    });

    const context = await getModuleContext(actor, { moduleKey: "context-module-a" });

    expect(context.activeAttempt).not.toBeNull();
    expect(context.activeAttempt?.id).toBe(attempt.id);
    expect(context.displayAttempt?.id).toBe(attempt.id);
    expect(context.activeAttempt?.status).toBe("draft");
  });

  it("reflects a saved Response's answer and advances resumeQuestionKey to the next unanswered Question", async () => {
    const { actor } = await createFounderWithActiveVenture("with-response");
    const runModule = await getModuleContext(actor, { moduleKey: "context-module-a" });
    const { attempt } = await startOrResumeAttempt(actor, {
      programRunModuleId: runModule.runModule.id,
    });
    await saveFounderResponse(actor, {
      attemptId: attempt.id,
      questionKey: "first_question",
      value: "My answer.",
    });

    const context = await getModuleContext(actor, { moduleKey: "context-module-a" });

    const firstQuestion = context.questions.find((q) => q.questionKey === "first_question");
    expect(firstQuestion?.responseStatus).toBe("answered");
    expect(firstQuestion?.answerText).toBe("My answer.");
    expect(context.resumeQuestionKey).toBe("final_decision");
  });

  it("returns null resumeQuestionKey once every Question has been answered", async () => {
    const { actor } = await createFounderWithActiveVenture("all-answered");
    const runModule = await getModuleContext(actor, { moduleKey: "context-module-a" });
    const { attempt } = await startOrResumeAttempt(actor, {
      programRunModuleId: runModule.runModule.id,
    });
    await saveFounderResponse(actor, {
      attemptId: attempt.id,
      questionKey: "first_question",
      value: "My answer.",
    });
    await saveFounderResponse(actor, {
      attemptId: attempt.id,
      questionKey: "final_decision",
      value: "proceed",
    });

    const context = await getModuleContext(actor, { moduleKey: "context-module-a" });
    expect(context.resumeQuestionKey).toBeNull();
  });

  it("reflects a saved Artifact Submission's latest version", async () => {
    const { actor } = await createFounderWithActiveVenture("with-artifact");
    const runModule = await getModuleContext(actor, { moduleKey: "context-module-a" });
    const { attempt } = await startOrResumeAttempt(actor, {
      programRunModuleId: runModule.runModule.id,
    });
    await saveArtifactSubmission(actor, {
      attemptId: attempt.id,
      artifactKey: "verdict",
      content: "# Verdict\n\nFixture content.\n",
    });

    const context = await getModuleContext(actor, { moduleKey: "context-module-a" });

    const artifact = context.artifacts.find((a) => a.artifactKey === "verdict");
    expect(artifact?.latestSubmission).toMatchObject({
      versionNumber: 1,
      status: "draft",
    });
  });

  it("scopes Questions/Artifacts strictly to the requested Module (a locked sibling Module sees only its own)", async () => {
    const { actor } = await createFounderWithActiveVenture("sibling-module");

    const context = await getModuleContext(actor, { moduleKey: "context-module-b" });

    expect(context.runModule.moduleKey).toBe("context-module-b");
    expect(context.runModule.status).toBe("locked");
    expect(context.questions).toEqual([]);
    expect(context.artifacts.map((a) => a.artifactKey)).toEqual(["sibling-artifact"]);
    expect(context.artifacts[0].latestSubmission).toBeNull();
    expect(context.activeAttempt).toBeNull();
    expect(context.resumeQuestionKey).toBeNull();
  });
});
