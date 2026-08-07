import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { seedToolkitContent } from "@ai-catalyst/services/content-seed";
import type { ToolkitSeedContent } from "@ai-catalyst/services/content-seed";
import { getOrCreateProgramRun } from "@ai-catalyst/services/workflow";
import {
  createFixtureFounderAccount,
  createFixtureVenture,
  withTransaction,
} from "@ai-catalyst/services/testing/db-fixtures";

import { saveFounderResponse, startOrResumeAttempt, submitAttempt } from "./index.js";

/**
 * Integration tests against the real Postgres database, following the
 * same fixture pattern as packages/services/src/workflow/index.db.test.ts:
 * a fixture Program (unique program_key, isolated from real V1 content)
 * seeded via the real seedToolkitContent reconciler, then a real
 * getOrCreateProgramRun call to obtain real program_run_modules rows to
 * exercise startOrResumeAttempt/saveFounderResponse/submitAttempt against.
 */

type FixtureModule = ToolkitSeedContent["modules"][number];
type FixtureQuestion = FixtureModule["questions"][number];

function webFounderActor(userId: string): ActorContext {
  // Explicit source: "web" (not a bare { userId, role } literal) so
  // resolveInteractionProvider deterministically maps to "website"
  // instead of falling through to its "claude" default — these tests
  // assert on started_via/source_provider values.
  return { userId, role: "founder", source: "web" };
}

const CURRENT_STAGE_OPTIONS = [
  { value: "idea_only", label: "Idea only" },
  { value: "pivot", label: "Pivot" },
];

// Fixture questions: long_text, single_choice, and conditional follow-up.
function buildSharedQuestions(): FixtureQuestion[] {
  return [
    {
      questionKey: "idea_story",
      sequenceIndex: 1,
      questionGroup: null,
      questionText: "Tell us about your idea.",
      helpText: null,
      placeholderText: null,
      responseType: "long_text",
      isRequired: true,
      allowSkip: true,
      options: [],
      conditions: {},
    },
    {
      questionKey: "current_stage",
      sequenceIndex: 2,
      questionGroup: null,
      questionText: "What stage are you at?",
      helpText: null,
      placeholderText: null,
      responseType: "single_choice",
      isRequired: true,
      allowSkip: false,
      options: CURRENT_STAGE_OPTIONS,
      conditions: {},
    },
    {
      questionKey: "pivot_detail",
      sequenceIndex: 3,
      questionGroup: null,
      questionText: "If pivoting, what changes?",
      helpText: null,
      placeholderText: null,
      responseType: "long_text",
      isRequired: false,
      allowSkip: false,
      options: [],
      conditions: { depends_on: "current_stage", operator: "equals", value: "pivot" },
    },
  ];
}

// Module B carries one extra question not present on Module A, so tests
// can prove a question_key from a different Module is rejected as
// NOT_FOUND (not just a nonexistent key).
function buildModuleBOnlyQuestion(): FixtureQuestion {
  return {
    questionKey: "module_b_exclusive",
    sequenceIndex: 4,
    questionGroup: null,
    questionText: "Only present on Module B.",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: false,
    allowSkip: true,
    options: [],
    conditions: {},
  };
}

function buildFixtureModule(
  moduleKey: string,
  sequenceIndex: number,
  extraQuestions: FixtureQuestion[] = [],
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
    questions: [...buildSharedQuestions(), ...extraQuestions],
    artifacts: [],
  };
}

function buildFixtureContent(programKey: string, modules: FixtureModule[]): ToolkitSeedContent {
  return {
    program: {
      programKey,
      programName: `Attempt service test program ${programKey}`,
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

describe("attempt service — database integration", () => {
  const RUN_SUFFIX = randomBytes(4).toString("hex");
  const emailPrefix = `attempt-test-${RUN_SUFFIX}`;
  const PROGRAM_KEY = `attempt-service-${RUN_SUFFIX}`;
  const createdUserIds: string[] = [];

  async function createFounderWithWorkspaceAndVenture(
    label: string,
  ): Promise<{ actor: ActorContext; workspaceId: string; ventureId: string }> {
    const { userId, workspaceId } = await createFixtureFounderAccount({
      label,
      emailPrefix,
      slugPrefix: "attempt-service",
    });
    createdUserIds.push(userId);

    const ventureId = await createFixtureVenture({
      workspaceId,
      createdByUserId: userId,
      label,
      slugPrefix: "attempt-service-venture",
    });

    return { actor: webFounderActor(userId), workspaceId, ventureId };
  }

  // Module A (sequence_index 0) always starts 'available'; Module B
  // (sequence_index 1) always starts 'locked' — exactly like
  // getOrCreateProgramRun's own contract (see workflow/index.db.test.ts).
  async function createRunWithModules(label: string): Promise<{
    actor: ActorContext;
    workspaceId: string;
    ventureId: string;
    moduleAId: string;
    moduleBId: string;
  }> {
    const { actor, workspaceId, ventureId } = await createFounderWithWorkspaceAndVenture(label);
    const result = await getOrCreateProgramRun(actor, { ventureId }, { programKey: PROGRAM_KEY });

    const modulesResult = await pool.query<{ id: string; module_key: string }>(
      `select id, module_key from program_run_modules
       where program_run_branch_id = $1
       order by sequence_index`,
      [result.run.activeBranchId],
    );
    const moduleA = modulesResult.rows.find((row) => row.module_key === "attempt-module-a");
    const moduleB = modulesResult.rows.find((row) => row.module_key === "attempt-module-b");
    if (!moduleA || !moduleB) {
      throw new Error("Fixture program_run_modules were not seeded as expected.");
    }

    return {
      actor,
      workspaceId,
      ventureId,
      moduleAId: moduleA.id,
      moduleBId: moduleB.id,
    };
  }

  async function getAttemptRow(attemptId: string) {
    const result = await pool.query<{
      id: string;
      status: string;
      attempt_number: number;
      attempt_type: string;
      based_on_attempt_id: string | null;
      submitted_at: Date | null;
    }>(
      `select id, status, attempt_number, attempt_type, based_on_attempt_id, submitted_at
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
      started_at: Date | null;
    }>(
      `select id, status, active_attempt_id, started_at from program_run_modules where id = $1`,
      [runModuleId],
    );
    return result.rows[0];
  }

  beforeAll(async () => {
    await withTransaction((client) =>
      seedToolkitContent(
        client,
        buildFixtureContent(PROGRAM_KEY, [
          buildFixtureModule("attempt-module-a", 0),
          buildFixtureModule("attempt-module-b", 1, [buildModuleBOnlyQuestion()]),
        ]),
      ),
    );
  });

  afterAll(async () => {
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

  describe("startOrResumeAttempt", () => {
    it("rejects a non-founder actor before touching the database", async () => {
      await expect(
        startOrResumeAttempt(
          { userId: randomUUID(), role: "admin" },
          { programRunModuleId: randomUUID() },
        ),
      ).rejects.toMatchObject({ name: "ServiceError", code: "FORBIDDEN" });
    });

    it("rejects a missing programRunModuleId", async () => {
      const { actor } = await createRunWithModules("missing-run-module-id");
      await expect(startOrResumeAttempt(actor, {})).rejects.toMatchObject({
        name: "ServiceError",
        code: "VALIDATION_ERROR",
      });
    });

    it("creates an Initial Attempt and moves the run_module to in_progress", async () => {
      const { actor, moduleAId } = await createRunWithModules("create-initial");

      const result = await startOrResumeAttempt(actor, { programRunModuleId: moduleAId });

      expect(result.created).toBe(true);
      expect(result.attempt.attemptNumber).toBe(1);
      expect(result.attempt.attemptType).toBe("initial");
      expect(result.attempt.status).toBe("draft");
      expect(result.attempt.basedOnAttemptId).toBeNull();
      expect(result.attempt.startedVia).toBe("website");

      const runModule = await getRunModuleRow(moduleAId);
      expect(runModule.status).toBe("in_progress");
      expect(runModule.active_attempt_id).toBe(result.attempt.id);
      expect(runModule.started_at).not.toBeNull();

      const eventsResult = await pool.query<{ event_type: string }>(
        `select event_type from module_events where module_attempt_id = $1`,
        [result.attempt.id],
      );
      expect(eventsResult.rows.map((row) => row.event_type)).toEqual(["attempt_started"]);
    });

    it("resumes the same draft Attempt on a second call, writing no extra event", async () => {
      const { actor, moduleAId } = await createRunWithModules("resume");

      const first = await startOrResumeAttempt(actor, { programRunModuleId: moduleAId });
      expect(first.created).toBe(true);

      const second = await startOrResumeAttempt(actor, { programRunModuleId: moduleAId });
      expect(second.created).toBe(false);
      expect(second.attempt.id).toBe(first.attempt.id);

      const eventsResult = await pool.query<{ count: string }>(
        `select count(*) as count from module_events
         where module_attempt_id = $1 and event_type = 'attempt_started'`,
        [first.attempt.id],
      );
      expect(Number(eventsResult.rows[0].count)).toBe(1);
    });

    it("rejects resuming with a mismatched basedOnAttemptId", async () => {
      const { actor, moduleAId } = await createRunWithModules("resume-mismatch");
      await startOrResumeAttempt(actor, { programRunModuleId: moduleAId });

      await expect(
        startOrResumeAttempt(actor, {
          programRunModuleId: moduleAId,
          basedOnAttemptId: randomUUID(),
        }),
      ).rejects.toMatchObject({ name: "ServiceError", code: "VALIDATION_ERROR" });
    });

    it("rejects starting a locked run_module with RUN_MODULE_NOT_AVAILABLE", async () => {
      const { actor, moduleBId } = await createRunWithModules("locked-module");

      await expect(
        startOrResumeAttempt(actor, { programRunModuleId: moduleBId }),
      ).rejects.toMatchObject({ name: "ServiceError", code: "RUN_MODULE_NOT_AVAILABLE" });
    });

    it("rejects resuming/restarting a Module whose active Attempt is pending review", async () => {
      const { actor, moduleAId } = await createRunWithModules("pending-review");
      const created = await startOrResumeAttempt(actor, { programRunModuleId: moduleAId });
      await submitAttempt(actor, { attemptId: created.attempt.id });

      await expect(
        startOrResumeAttempt(actor, { programRunModuleId: moduleAId }),
      ).rejects.toMatchObject({ name: "ServiceError", code: "ATTEMPT_PENDING_REVIEW" });
    });

    it("rejects a basedOnAttemptId when the Module has no prior Attempts", async () => {
      const { actor, moduleAId } = await createRunWithModules("no-history-retry");

      await expect(
        startOrResumeAttempt(actor, {
          programRunModuleId: moduleAId,
          basedOnAttemptId: randomUUID(),
        }),
      ).rejects.toMatchObject({ name: "ServiceError", code: "VALIDATION_ERROR" });
    });

    it("creates exactly one Attempt when two calls race for the same brand-new run_module", async () => {
      const { actor, moduleAId } = await createRunWithModules("concurrency-initial");

      const [resultA, resultB] = await Promise.all([
        startOrResumeAttempt(actor, { programRunModuleId: moduleAId }),
        startOrResumeAttempt(actor, { programRunModuleId: moduleAId }),
      ]);

      expect(resultA.attempt.id).toBe(resultB.attempt.id);
      expect([resultA.created, resultB.created].filter(Boolean)).toHaveLength(1);

      const countResult = await pool.query<{ count: string }>(
        `select count(*) as count from module_attempts where program_run_module_id = $1`,
        [moduleAId],
      );
      expect(Number(countResult.rows[0].count)).toBe(1);
    });

    describe("Retry", () => {
      // Rejecting an Attempt and clearing active_attempt_id is 2.6/4.2's
      // job, not implemented yet — these tests manufacture that
      // post-rejection state directly via raw SQL, the same sanctioned
      // pattern as the ATTEMPT_NOT_SUBMITTABLE test below.
      async function createRejectedAttempt(
        actor: ActorContext,
        runModuleId: string,
      ): Promise<string> {
        const created = await startOrResumeAttempt(actor, { programRunModuleId: runModuleId });
        await pool.query(
          `update module_attempts set status = 'rejected', rejected_at = now() where id = $1`,
          [created.attempt.id],
        );
        await pool.query(
          `update program_run_modules set active_attempt_id = null where id = $1`,
          [runModuleId],
        );
        return created.attempt.id;
      }

      it("auto-resolves the retry source when basedOnAttemptId is omitted", async () => {
        const { actor, moduleAId } = await createRunWithModules("retry-auto-based-on");
        const sourceAttemptId = await createRejectedAttempt(actor, moduleAId);

        const result = await startOrResumeAttempt(actor, {
          programRunModuleId: moduleAId,
        });

        expect(result.created).toBe(true);
        expect(result.attempt.attemptType).toBe("retry");
        expect(result.attempt.basedOnAttemptId).toBe(sourceAttemptId);
        expect(result.attempt.attemptNumber).toBe(2);
      });

      it("creates a Retry Attempt with an incremented attempt_number", async () => {
        const { actor, moduleAId } = await createRunWithModules("retry-create");
        const sourceAttemptId = await createRejectedAttempt(actor, moduleAId);

        const result = await startOrResumeAttempt(actor, {
          programRunModuleId: moduleAId,
          basedOnAttemptId: sourceAttemptId,
        });

        expect(result.created).toBe(true);
        expect(result.attempt.attemptType).toBe("retry");
        expect(result.attempt.attemptNumber).toBe(2);
        expect(result.attempt.basedOnAttemptId).toBe(sourceAttemptId);

        const runModule = await getRunModuleRow(moduleAId);
        expect(runModule.status).toBe("in_progress");
        expect(runModule.active_attempt_id).toBe(result.attempt.id);

        const eventsResult = await pool.query<{ event_type: string }>(
          `select event_type from module_events
           where module_attempt_id = $1`,
          [result.attempt.id],
        );
        expect(eventsResult.rows.map((row) => row.event_type)).toEqual(["retry_started"]);
      });

      it("rejects a basedOnAttemptId whose status is not retryable", async () => {
        const { actor, moduleAId } = await createRunWithModules("retry-not-retryable");
        const created = await startOrResumeAttempt(actor, { programRunModuleId: moduleAId });
        // Simulates a 4.2 Mentor Accept — 'accepted' is not in
        // RETRYABLE_ATTEMPT_STATUSES.
        await pool.query(`update module_attempts set status = 'accepted' where id = $1`, [
          created.attempt.id,
        ]);
        await pool.query(
          `update program_run_modules set active_attempt_id = null where id = $1`,
          [moduleAId],
        );

        await expect(
          startOrResumeAttempt(actor, {
            programRunModuleId: moduleAId,
            basedOnAttemptId: created.attempt.id,
          }),
        ).rejects.toMatchObject({ name: "ServiceError", code: "ATTEMPT_RETRY_SOURCE_INVALID" });
      });

      it("rejects a basedOnAttemptId that belongs to a different Module", async () => {
        const { actor, moduleAId, moduleBId } = await createRunWithModules("retry-cross-module");
        const sourceFromModuleA = await createRejectedAttempt(actor, moduleAId);

        // Manufactures Module B into a startable + already-has-history
        // state (unlocking a Module is 4.2's job, not implemented yet).
        await pool.query(`update program_run_modules set status = 'available' where id = $1`, [
          moduleBId,
        ]);
        await createRejectedAttempt(actor, moduleBId);

        await expect(
          startOrResumeAttempt(actor, {
            programRunModuleId: moduleBId,
            basedOnAttemptId: sourceFromModuleA,
          }),
        ).rejects.toMatchObject({ name: "ServiceError", code: "ATTEMPT_RETRY_SOURCE_INVALID" });
      });

      it("rejects a basedOnAttemptId that has already been retried (clean pre-check)", async () => {
        const { actor, moduleAId } = await createRunWithModules("retry-already-used");
        const sourceAttemptId = await createRejectedAttempt(actor, moduleAId);

        const firstRetry = await startOrResumeAttempt(actor, {
          programRunModuleId: moduleAId,
          basedOnAttemptId: sourceAttemptId,
        });
        expect(firstRetry.created).toBe(true);

        // Reject the retry too, so the Module has active_attempt_id=null
        // and history again, then try to base a second Retry on the
        // *original* source — already consumed by firstRetry.
        await pool.query(`update module_attempts set status = 'rejected' where id = $1`, [
          firstRetry.attempt.id,
        ]);
        await pool.query(
          `update program_run_modules set active_attempt_id = null where id = $1`,
          [moduleAId],
        );

        await expect(
          startOrResumeAttempt(actor, {
            programRunModuleId: moduleAId,
            basedOnAttemptId: sourceAttemptId,
          }),
        ).rejects.toMatchObject({ name: "ServiceError", code: "ATTEMPT_RETRY_SOURCE_INVALID" });
      });

      it("serializes two concurrent Retry creations against the same source Attempt into a single row", async () => {
        const { actor, moduleAId } = await createRunWithModules("retry-concurrent-service");
        const sourceAttemptId = await createRejectedAttempt(actor, moduleAId);

        // The mandated lock ordering (program_run_modules locked first,
        // for the whole duration of the transaction) fully serializes two
        // concurrent calls against the *same* run_module: the second call
        // only proceeds after the first commits, by which point
        // active_attempt_id already points at the newly created Retry —
        // so the second call resolves via the plain resume branch
        // (basedOnAttemptId still matches that Retry's own
        // based_on_attempt_id) rather than racing the INSERT. Both calls
        // succeed; exactly one row is created. The raw-SQL test below
        // exercises the migration's unique index directly, for the case
        // where two writers don't go through this Service's lock at all.
        const [resultA, resultB] = await Promise.all([
          startOrResumeAttempt(actor, {
            programRunModuleId: moduleAId,
            basedOnAttemptId: sourceAttemptId,
          }),
          startOrResumeAttempt(actor, {
            programRunModuleId: moduleAId,
            basedOnAttemptId: sourceAttemptId,
          }),
        ]);

        expect(resultA.attempt.id).toBe(resultB.attempt.id);
        expect([resultA.created, resultB.created].filter(Boolean)).toHaveLength(1);

        const countResult = await pool.query<{ count: string }>(
          `select count(*) as count from module_attempts where based_on_attempt_id = $1`,
          [sourceAttemptId],
        );
        expect(Number(countResult.rows[0].count)).toBe(1);
      });

      it("enforces module_attempts_based_on_unique at the database level under true concurrency", async () => {
        const { actor, moduleAId } = await createRunWithModules("retry-concurrent-raw");
        const sourceAttemptId = await createRejectedAttempt(actor, moduleAId);

        // Bypasses the Service (and therefore its run_module lock
        // entirely) with two independent connections racing a raw INSERT
        // against based_on_attempt_id — this is the actual race window
        // the migration's partial unique index exists to close. Status is
        // 'validation_failed' (not 'draft') so the *other* partial unique
        // index, module_attempts_one_active_unique, never fires here —
        // this test isolates module_attempts_based_on_unique specifically.
        async function rawInsertRetry(attemptNumber: number): Promise<void> {
          const client = await pool.connect();
          try {
            await client.query("begin");
            await client.query(
              `insert into module_attempts (
                 workspace_id, program_run_module_id, attempt_number, attempt_type,
                 status, based_on_attempt_id, started_by_user_id, started_via
               )
               select workspace_id, $2, $3, 'retry', 'validation_failed', $4, started_by_user_id, started_via
               from module_attempts where id = $1`,
              [sourceAttemptId, moduleAId, attemptNumber, sourceAttemptId],
            );
            await client.query("commit");
          } catch (error) {
            await client.query("rollback");
            throw error;
          } finally {
            client.release();
          }
        }

        const results = await Promise.allSettled([
          rawInsertRetry(2),
          rawInsertRetry(3),
        ]);

        const fulfilled = results.filter((result) => result.status === "fulfilled");
        const rejected = results.filter((result) => result.status === "rejected");
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
          code: "23505",
          constraint: "module_attempts_based_on_unique",
        });

        const countResult = await pool.query<{ count: string }>(
          `select count(*) as count from module_attempts where based_on_attempt_id = $1`,
          [sourceAttemptId],
        );
        expect(Number(countResult.rows[0].count)).toBe(1);
      });
    });
  });

  describe("saveFounderResponse", () => {
    async function createDraftAttempt(label: string) {
      const context = await createRunWithModules(label);
      const created = await startOrResumeAttempt(context.actor, {
        programRunModuleId: context.moduleAId,
      });
      return { ...context, attemptId: created.attempt.id };
    }

    it("rejects a non-founder actor before touching the database", async () => {
      await expect(
        saveFounderResponse(
          { userId: randomUUID(), role: "admin" },
          { attemptId: randomUUID(), questionKey: "idea_story" },
        ),
      ).rejects.toMatchObject({ name: "ServiceError", code: "FORBIDDEN" });
    });

    it("rejects an Attempt belonging to another Workspace as NOT_FOUND", async () => {
      const { actor } = await createDraftAttempt("cross-workspace-caller");
      const { attemptId: foreignAttemptId } = await createDraftAttempt(
        "cross-workspace-target",
      );

      await expect(
        saveFounderResponse(actor, { attemptId: foreignAttemptId, questionKey: "idea_story" }),
      ).rejects.toMatchObject({ name: "ServiceError", code: "NOT_FOUND" });
    });

    it("rejects a question_key that belongs to a different Module as NOT_FOUND", async () => {
      const { actor, attemptId } = await createDraftAttempt("wrong-module-question");

      await expect(
        saveFounderResponse(actor, {
          attemptId,
          questionKey: "module_b_exclusive",
          value: "should not resolve",
        }),
      ).rejects.toMatchObject({ name: "ServiceError", code: "NOT_FOUND" });
    });

    it("saves a long_text answer and transitions the Attempt from draft to in_progress", async () => {
      const { actor, attemptId } = await createDraftAttempt("first-response-transition");

      const response = await saveFounderResponse(actor, {
        attemptId,
        questionKey: "idea_story",
        value: "A marketplace for something.",
      });

      expect(response.responseStatus).toBe("answered");
      expect(response.answerText).toBe("A marketplace for something.");

      const attempt = await getAttemptRow(attemptId);
      expect(attempt.status).toBe("in_progress");

      const eventsResult = await pool.query<{ event_type: string }>(
        `select event_type from module_events where module_attempt_id = $1`,
        [attemptId],
      );
      expect(eventsResult.rows.map((row) => row.event_type)).toEqual([
        "attempt_started",
        "response_saved",
      ]);
    });

    it("rejects a single_choice answer that does not match any option", async () => {
      const { actor, attemptId } = await createDraftAttempt("invalid-option");

      await expect(
        saveFounderResponse(actor, {
          attemptId,
          questionKey: "current_stage",
          value: "not_a_real_option",
        }),
      ).rejects.toMatchObject({ name: "ServiceError", code: "VALIDATION_ERROR" });
    });

    it("rejects skipped when the question does not allow_skip", async () => {
      const { actor, attemptId } = await createDraftAttempt("skip-not-allowed");

      await expect(
        saveFounderResponse(actor, {
          attemptId,
          questionKey: "current_stage",
          responseStatus: "skipped",
        }),
      ).rejects.toMatchObject({ name: "ServiceError", code: "VALIDATION_ERROR" });
    });

    it("accepts skipped when the question allows it", async () => {
      const { actor, attemptId } = await createDraftAttempt("skip-allowed");

      const response = await saveFounderResponse(actor, {
        attemptId,
        questionKey: "idea_story",
        responseStatus: "skipped",
      });

      expect(response.responseStatus).toBe("skipped");
      expect(response.answerText).toBeNull();
    });

    it("rejects not_applicable on a question with no conditions", async () => {
      const { actor, attemptId } = await createDraftAttempt("not-applicable-no-conditions");

      await expect(
        saveFounderResponse(actor, {
          attemptId,
          questionKey: "idea_story",
          responseStatus: "not_applicable",
        }),
      ).rejects.toMatchObject({ name: "ServiceError", code: "VALIDATION_ERROR" });
    });

    it("accepts not_applicable when the dependency hasn't been answered yet", async () => {
      const { actor, attemptId } = await createDraftAttempt("not-applicable-unanswered-dep");

      const response = await saveFounderResponse(actor, {
        attemptId,
        questionKey: "pivot_detail",
        responseStatus: "not_applicable",
      });

      expect(response.responseStatus).toBe("not_applicable");
    });

    it("accepts not_applicable when the dependency's condition does not currently hold", async () => {
      const { actor, attemptId } = await createDraftAttempt("not-applicable-condition-false");

      await saveFounderResponse(actor, {
        attemptId,
        questionKey: "current_stage",
        value: "idea_only",
      });

      const response = await saveFounderResponse(actor, {
        attemptId,
        questionKey: "pivot_detail",
        responseStatus: "not_applicable",
      });
      expect(response.responseStatus).toBe("not_applicable");
    });

    it("rejects not_applicable when the dependency's condition currently holds", async () => {
      const { actor, attemptId } = await createDraftAttempt("not-applicable-condition-true");

      await saveFounderResponse(actor, {
        attemptId,
        questionKey: "current_stage",
        value: "pivot",
      });

      await expect(
        saveFounderResponse(actor, {
          attemptId,
          questionKey: "pivot_detail",
          responseStatus: "not_applicable",
        }),
      ).rejects.toMatchObject({ name: "ServiceError", code: "VALIDATION_ERROR" });
    });

    it("accepts needs_follow_up without answered-type validation", async () => {
      const { actor, attemptId } = await createDraftAttempt("needs-follow-up");

      const response = await saveFounderResponse(actor, {
        attemptId,
        questionKey: "current_stage",
        responseStatus: "needs_follow_up",
        value: "not_a_real_option_but_thats_fine_here",
      });

      expect(response.responseStatus).toBe("needs_follow_up");
      expect(response.answerText).toBe("not_a_real_option_but_thats_fine_here");
    });

    it("upserts on a repeated save for the same question_key, keeping a single row", async () => {
      const { actor, attemptId } = await createDraftAttempt("upsert");

      await saveFounderResponse(actor, { attemptId, questionKey: "idea_story", value: "First." });
      const second = await saveFounderResponse(actor, {
        attemptId,
        questionKey: "idea_story",
        value: "Second, revised.",
      });

      expect(second.answerText).toBe("Second, revised.");

      const countResult = await pool.query<{ count: string }>(
        `select count(*) as count from module_responses
         where module_attempt_id = $1 and question_key = 'idea_story'`,
        [attemptId],
      );
      expect(Number(countResult.rows[0].count)).toBe(1);
    });

    it("does not duplicate a row when two saves for the same question_key race", async () => {
      const { actor, attemptId } = await createDraftAttempt("upsert-concurrent");

      await Promise.all([
        saveFounderResponse(actor, { attemptId, questionKey: "idea_story", value: "Race A." }),
        saveFounderResponse(actor, { attemptId, questionKey: "idea_story", value: "Race B." }),
      ]);

      const countResult = await pool.query<{ count: string }>(
        `select count(*) as count from module_responses
         where module_attempt_id = $1 and question_key = 'idea_story'`,
        [attemptId],
      );
      expect(Number(countResult.rows[0].count)).toBe(1);
    });

    it("rejects saving to an Attempt that is no longer editable", async () => {
      const { actor, attemptId } = await createDraftAttempt("not-editable");
      await submitAttempt(actor, { attemptId });

      await expect(
        saveFounderResponse(actor, { attemptId, questionKey: "idea_story", value: "Too late." }),
      ).rejects.toMatchObject({ name: "ServiceError", code: "ATTEMPT_NOT_EDITABLE" });
    });
  });

  describe("submitAttempt", () => {
    async function createDraftAttempt(label: string) {
      const context = await createRunWithModules(label);
      const created = await startOrResumeAttempt(context.actor, {
        programRunModuleId: context.moduleAId,
      });
      return { ...context, attemptId: created.attempt.id };
    }

    it("rejects a non-founder actor before touching the database", async () => {
      await expect(
        submitAttempt({ userId: randomUUID(), role: "admin" }, { attemptId: randomUUID() }),
      ).rejects.toMatchObject({ name: "ServiceError", code: "FORBIDDEN" });
    });

    it("rejects an Attempt belonging to another Workspace as NOT_FOUND", async () => {
      const { actor } = await createDraftAttempt("submit-cross-workspace-caller");
      const { attemptId: foreignAttemptId } = await createDraftAttempt(
        "submit-cross-workspace-target",
      );

      await expect(
        submitAttempt(actor, { attemptId: foreignAttemptId }),
      ).rejects.toMatchObject({ name: "ServiceError", code: "NOT_FOUND" });
    });

    it("submits with zero Responses, freezing an empty Review Context Snapshot", async () => {
      const { actor, attemptId, moduleAId } = await createDraftAttempt("zero-response-submit");

      const submitted = await submitAttempt(actor, { attemptId });

      expect(submitted.status).toBe("submitted");
      expect(submitted.submittedAt).not.toBeNull();

      const runModule = await getRunModuleRow(moduleAId);
      expect(runModule.status).toBe("in_progress");
      expect(runModule.active_attempt_id).toBe(attemptId);

      const snapshotResult = await pool.query<{ response_snapshot: unknown[] }>(
        `select response_snapshot from module_review_context_snapshots where module_attempt_id = $1`,
        [attemptId],
      );
      expect(snapshotResult.rows).toHaveLength(1);
      expect(snapshotResult.rows[0].response_snapshot).toEqual([]);

      const eventsResult = await pool.query<{ event_type: string }>(
        `select event_type from module_events where module_attempt_id = $1`,
        [attemptId],
      );
      expect(eventsResult.rows.map((row) => row.event_type)).toEqual([
        "attempt_started",
        "attempt_submitted",
      ]);
    });

    it("freezes the current Responses into the Review Context Snapshot", async () => {
      const { actor, attemptId } = await createDraftAttempt("submit-with-responses");
      await saveFounderResponse(actor, {
        attemptId,
        questionKey: "idea_story",
        value: "A durable snapshot test.",
      });
      await saveFounderResponse(actor, {
        attemptId,
        questionKey: "current_stage",
        value: "idea_only",
      });

      await submitAttempt(actor, { attemptId });

      const snapshotResult = await pool.query<{
        response_snapshot: Array<{ questionKey: string; answerText: string | null }>;
      }>(
        `select response_snapshot from module_review_context_snapshots where module_attempt_id = $1`,
        [attemptId],
      );
      const snapshot = snapshotResult.rows[0].response_snapshot;
      expect(snapshot).toHaveLength(2);
      expect(snapshot.map((entry) => entry.questionKey)).toEqual([
        "idea_story",
        "current_stage",
      ]);
    });

    it("is idempotent for an already-submitted Attempt (no snapshot/timestamp rewrite)", async () => {
      const { actor, attemptId } = await createDraftAttempt("submit-idempotent");

      const first = await submitAttempt(actor, { attemptId });
      const second = await submitAttempt(actor, { attemptId });

      expect(second.submittedAt).toBe(first.submittedAt);

      const countResult = await pool.query<{ count: string }>(
        `select count(*) as count from module_review_context_snapshots where module_attempt_id = $1`,
        [attemptId],
      );
      expect(Number(countResult.rows[0].count)).toBe(1);
    });

    it("rejects submitting an Attempt in a terminal, non-submittable status", async () => {
      const { actor, attemptId } = await createDraftAttempt("submit-terminal-status");
      // Simulates a post-2.6/4.2 terminal state directly, since those PRs
      // don't exist yet.
      await pool.query(`update module_attempts set status = 'rejected' where id = $1`, [
        attemptId,
      ]);

      await expect(submitAttempt(actor, { attemptId })).rejects.toMatchObject({
        name: "ServiceError",
        code: "ATTEMPT_NOT_SUBMITTABLE",
      });
    });
  });
});
