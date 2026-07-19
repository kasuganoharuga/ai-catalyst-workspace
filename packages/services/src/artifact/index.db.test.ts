import { randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { seedToolkitContent } from "@ai-catalyst/services/content-seed";
import type { ToolkitSeedContent } from "@ai-catalyst/services/content-seed";
import { getOrCreateProgramRun } from "@ai-catalyst/services/workflow";
import { saveFounderResponse, startOrResumeAttempt, submitAttempt } from "@ai-catalyst/services/attempt";

import type { Validator } from "./internal/validators/types.js";
import {
  getArtifactSubmission,
  getLatestValidation,
  runDraftCheck,
  runOfficialValidation,
  saveArtifactSubmission,
} from "./index.js";

/**
 * Integration tests against the real Postgres database, following the
 * same fixture pattern as attempt/index.db.test.ts: a fixture Program
 * seeded via the real seedToolkitContent reconciler, real
 * getOrCreateProgramRun / startOrResumeAttempt / saveFounderResponse /
 * submitAttempt calls to reach a real 'submitted' Attempt, then this
 * module's own functions exercised against it.
 *
 * `FIXTURE_VALIDATOR` is injected via `ArtifactServiceDependencies.validators`
 * rather than depending on the real `pressure_test_verdict_v1` — that
 * Validator already has its own dedicated pure unit tests
 * (pressure-test-verdict-v1.test.ts); this suite is about the Service
 * layer's own versioning/idempotency/locking/permission logic, which
 * needs a Validator simple enough to drive deterministically from a
 * Response value.
 */

type FixtureModule = ToolkitSeedContent["modules"][number];
type FixtureQuestion = FixtureModule["questions"][number];
type FixtureArtifact = FixtureModule["artifacts"][number];

const REQUIRED_MARKER = "REQUIRED_MARKER";
const FIXTURE_VALIDATOR_KEY = "fixture-validator-v1";

// draft_check: content must contain REQUIRED_MARKER.
// official: additionally requires `final_decision` to be answered
// "proceed" — the closest analogue to pressure_test_verdict_v1's own
// submissionRules (a rule that only makes sense once the Attempt is
// actually being submitted for review), without needing to reproduce
// that Validator's full Markdown template here.
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
    const markerCheck = fixtureValidator.runDraftCheck(ctx);
    const decision = ctx.responses.find((response) => response.questionKey === "final_decision");
    const decisionPassed = decision?.responseStatus === "answered" && decision.answerText === "proceed";
    const checks = [
      ...markerCheck.checks,
      { key: "final_decision_is_proceed", passed: decisionPassed },
    ];
    const passed = markerCheck.passed && decisionPassed;
    return {
      checks,
      issues: passed ? [] : ["Official check failed."],
      warnings: [],
      passed,
      score: passed ? 100 : 0,
    };
  },
};

const FIXTURE_DEPS = { validators: { [FIXTURE_VALIDATOR_KEY]: fixtureValidator } };

function webFounderActor(userId: string): ActorContext {
  return { userId, role: "founder", source: "web" };
}

function mcpFounderActor(userId: string): ActorContext {
  return { userId, role: "founder", source: "mcp" };
}

// Matches storage/index.db.test.ts's own system-actor fixture convention:
// role "admin" with source "system" — ActorContext's role union has no
// "system" value, and getGeneratedTextContent's founder-Workspace-scoping
// branch keys only on `actor.role === "founder"` (not source), so a
// system-sourced actor must NOT carry role "founder" or it would
// incorrectly be routed through resolveFounderWorkspace.
function systemActor(userId: string): ActorContext {
  return { userId, role: "admin", source: "system" };
}

function adminActor(userId: string): ActorContext {
  return { userId, role: "admin" };
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

const DECISION_OPTIONS = [
  { value: "proceed", label: "Proceed" },
  { value: "pivot", label: "Pivot" },
];

function buildFixtureQuestions(): FixtureQuestion[] {
  return [
    {
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
    },
  ];
}

function buildFixtureArtifact(
  artifactKey: string,
  options: { validatorKey: string | null; isRequired: boolean; sequenceIndex: number },
): FixtureArtifact {
  return {
    artifactKey,
    sequenceIndex: options.sequenceIndex,
    name: `Fixture artifact ${artifactKey}`,
    description: null,
    isRequired: options.isRequired,
    artifactType: "document",
    sourceFormat: "markdown",
    outputFormat: "markdown",
    requiredFilename: `${artifactKey}.md`,
    rendererKey: null,
    validatorKey: options.validatorKey,
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
    questions: buildFixtureQuestions(),
    artifacts,
  };
}

function buildFixtureContent(programKey: string, modules: FixtureModule[]): ToolkitSeedContent {
  return {
    program: {
      programKey,
      programName: `Artifact service test program ${programKey}`,
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

describe("artifact service — database integration", () => {
  const RUN_SUFFIX = randomBytes(4).toString("hex");
  const emailPrefix = `artifact-test-${RUN_SUFFIX}`;
  const PROGRAM_KEY = `artifact-service-${RUN_SUFFIX}`;
  const PROGRAM_KEY_MULTI = `artifact-service-multi-${RUN_SUFFIX}`;
  const createdUserIds: string[] = [];

  async function createFounderWithWorkspaceAndVenture(
    label: string,
  ): Promise<{ actor: ActorContext; workspaceId: string; ventureId: string }> {
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
      [actor.userId, `Fixture ${label}`, `artifact-service-${label}-${randomUUID()}`],
    );
    const workspaceId = workspaceResult.rows[0].id;

    const ventureResult = await pool.query<{ id: string }>(
      `insert into ventures (workspace_id, created_by_user_id, name, slug)
       values ($1, $2, $3, $4) returning id`,
      [
        workspaceId,
        actor.userId,
        `Fixture Venture ${label}`,
        `artifact-service-venture-${label}-${randomUUID()}`,
      ],
    );

    return { actor, workspaceId, ventureId: ventureResult.rows[0].id };
  }

  async function createTrustedUser(label: string): Promise<string> {
    const email = `${emailPrefix}-${label}-${randomUUID()}@example.com`;
    const userResult = await pool.query<{ id: string }>(
      "insert into users (name, email, role) values ($1, $2, 'admin') returning id",
      [`${emailPrefix}-${label}`, email],
    );
    createdUserIds.push(userResult.rows[0].id);
    return userResult.rows[0].id;
  }

  async function createRunWithModules(
    label: string,
    programKey: string,
    moduleKeys: { available: string; locked?: string },
  ): Promise<{
    actor: ActorContext;
    workspaceId: string;
    ventureId: string;
    availableModuleId: string;
    lockedModuleId?: string;
  }> {
    const { actor, workspaceId, ventureId } = await createFounderWithWorkspaceAndVenture(label);
    const result = await getOrCreateProgramRun(actor, { ventureId }, { programKey });

    const modulesResult = await pool.query<{ id: string; module_key: string }>(
      `select id, module_key from program_run_modules
       where program_run_branch_id = $1
       order by sequence_index`,
      [result.run.activeBranchId],
    );
    const availableModule = modulesResult.rows.find(
      (row) => row.module_key === moduleKeys.available,
    );
    if (!availableModule) {
      throw new Error("Fixture program_run_modules were not seeded as expected.");
    }
    const lockedModule = moduleKeys.locked
      ? modulesResult.rows.find((row) => row.module_key === moduleKeys.locked)
      : undefined;

    return {
      actor,
      workspaceId,
      ventureId,
      availableModuleId: availableModule.id,
      lockedModuleId: lockedModule?.id,
    };
  }

  async function getRunModuleRow(runModuleId: string) {
    const result = await pool.query<{
      id: string;
      status: string;
      active_attempt_id: string | null;
    }>(`select id, status, active_attempt_id from program_run_modules where id = $1`, [
      runModuleId,
    ]);
    return result.rows[0];
  }

  async function getAttemptStatus(attemptId: string): Promise<string> {
    const result = await pool.query<{ status: string }>(
      `select status from module_attempts where id = $1`,
      [attemptId],
    );
    return result.rows[0].status;
  }

  async function getSubmissionRow(submissionId: string) {
    const result = await pool.query<{
      id: string;
      status: string;
      version_number: number;
      created_via: string;
      created_by_user_id: string;
      submitted_at: Date | null;
      superseded_at: Date | null;
    }>(
      `select id, status, version_number, created_via, created_by_user_id, submitted_at, superseded_at
       from artifact_submissions where id = $1`,
      [submissionId],
    );
    return result.rows[0];
  }

  async function getValidationRows(submissionId: string) {
    const result = await pool.query<{
      id: string;
      validation_number: number;
      validation_kind: string;
      status: string;
      rule_snapshot: Record<string, unknown>;
      triggered_by_user_id: string;
      started_at: Date | null;
      completed_at: Date | null;
    }>(
      `select id, validation_number, validation_kind, status, rule_snapshot, triggered_by_user_id,
              started_at, completed_at
       from artifact_validations
       where artifact_submission_id = $1
       order by validation_number`,
      [submissionId],
    );
    return result.rows;
  }

  async function getEventTypes(attemptId: string): Promise<string[]> {
    const result = await pool.query<{ event_type: string }>(
      `select event_type from module_events where module_attempt_id = $1 order by created_at`,
      [attemptId],
    );
    return result.rows.map((row) => row.event_type);
  }

  async function createDraftAttempt(label: string) {
    const context = await createRunWithModules(label, PROGRAM_KEY, {
      available: "artifact-module-a",
      locked: "artifact-module-b",
    });
    const created = await startOrResumeAttempt(context.actor, {
      programRunModuleId: context.availableModuleId,
    });
    return { ...context, attemptId: created.attempt.id };
  }

  async function createSubmittedAttempt(label: string, decision: "proceed" | "pivot" = "proceed") {
    const context = await createDraftAttempt(label);
    await saveArtifactSubmission(context.actor, {
      attemptId: context.attemptId,
      artifactKey: "verdict",
      content: `# Verdict\n\n${REQUIRED_MARKER}\n`,
    });
    await saveFounderResponse(context.actor, {
      attemptId: context.attemptId,
      questionKey: "final_decision",
      value: decision,
    });
    await submitAttempt(context.actor, { attemptId: context.attemptId });
    return context;
  }

  beforeAll(async () => {
    await withTransaction((client) =>
      seedToolkitContent(
        client,
        buildFixtureContent(PROGRAM_KEY, [
          buildFixtureModule("artifact-module-a", 0, [
            buildFixtureArtifact("verdict", {
              validatorKey: FIXTURE_VALIDATOR_KEY,
              isRequired: true,
              sequenceIndex: 1,
            }),
            buildFixtureArtifact("no-validator", {
              validatorKey: null,
              isRequired: false,
              sequenceIndex: 2,
            }),
          ]),
          buildFixtureModule("artifact-module-b", 1, [
            buildFixtureArtifact("cross-module-artifact", {
              validatorKey: FIXTURE_VALIDATOR_KEY,
              isRequired: true,
              sequenceIndex: 1,
            }),
          ]),
        ]),
      ),
    );
    await withTransaction((client) =>
      seedToolkitContent(
        client,
        buildFixtureContent(PROGRAM_KEY_MULTI, [
          buildFixtureModule("artifact-module-multi", 0, [
            buildFixtureArtifact("verdict-1", {
              validatorKey: FIXTURE_VALIDATOR_KEY,
              isRequired: true,
              sequenceIndex: 1,
            }),
            buildFixtureArtifact("verdict-2", {
              validatorKey: FIXTURE_VALIDATOR_KEY,
              isRequired: true,
              sequenceIndex: 2,
            }),
          ]),
        ]),
      ),
    );
  });

  afterAll(async () => {
    // Deleted explicitly, ahead of the venture cascade below:
    // artifact_submissions_run_module_definition_fk (program_run_module_id,
    // module_definition_id) -> program_run_modules has no "on delete
    // cascade" of its own (unlike module_attempt_id's FK to module_attempts,
    // which does) — relying solely on cascading through
    // ventures -> ... -> program_run_modules races against that constraint's
    // own trigger and can fail with "violates foreign key constraint"
    // depending on Postgres's cascade trigger firing order. artifact_files
    // and artifact_validations both cascade from artifact_submissions, so
    // deleting this one table is enough.
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
    await pool.query("delete from programs where program_key = any($1::text[])", [
      [PROGRAM_KEY, PROGRAM_KEY_MULTI],
    ]);
  });

  describe("saveArtifactSubmission", () => {
    it("creates version 1 with created_via 'website' for a web-sourced founder", async () => {
      const { actor, attemptId } = await createDraftAttempt("save-v1");

      const submission = await saveArtifactSubmission(actor, {
        attemptId,
        artifactKey: "verdict",
        content: "# Verdict\n\nFirst draft.\n",
      });

      expect(submission.versionNumber).toBe(1);
      expect(submission.status).toBe("draft");
      expect(submission.createdVia).toBe("website");

      const row = await getSubmissionRow(submission.id);
      expect(row.created_by_user_id).toBe(actor.userId);
    });

    it("maps an mcp-sourced founder to created_via 'claude'", async () => {
      const { actor, attemptId } = await createDraftAttempt("save-mcp");

      const submission = await saveArtifactSubmission(mcpFounderActor(actor.userId), {
        attemptId,
        artifactKey: "verdict",
        content: "# Verdict\n\nFrom Claude.\n",
      });

      expect(submission.createdVia).toBe("claude");
    });

    it("increments version_number and marks the prior version superseded on changed content", async () => {
      const { actor, attemptId } = await createDraftAttempt("save-supersede");

      const first = await saveArtifactSubmission(actor, {
        attemptId,
        artifactKey: "verdict",
        content: "# Verdict\n\nVersion one.\n",
      });
      const second = await saveArtifactSubmission(actor, {
        attemptId,
        artifactKey: "verdict",
        content: "# Verdict\n\nVersion two.\n",
      });

      expect(second.versionNumber).toBe(2);
      const firstRow = await getSubmissionRow(first.id);
      expect(firstRow.status).toBe("superseded");
      expect(firstRow.superseded_at).not.toBeNull();
    });

    it("is hash-idempotent: identical content returns the same version, no new row", async () => {
      const { actor, attemptId } = await createDraftAttempt("save-idempotent");

      const first = await saveArtifactSubmission(actor, {
        attemptId,
        artifactKey: "verdict",
        content: "# Verdict\n\nStable content.\n",
      });
      const second = await saveArtifactSubmission(actor, {
        attemptId,
        artifactKey: "verdict",
        content: "# Verdict\n\nStable content.\n",
      });

      expect(second.id).toBe(first.id);
      expect(second.versionNumber).toBe(1);

      const countResult = await pool.query<{ count: string }>(
        `select count(*) as count from artifact_submissions where module_attempt_id = $1`,
        [attemptId],
      );
      expect(Number(countResult.rows[0].count)).toBe(1);

      const filesCountResult = await pool.query<{ count: string }>(
        `select count(*) as count from artifact_files where artifact_submission_id = $1`,
        [first.id],
      );
      expect(Number(filesCountResult.rows[0].count)).toBe(1);
    });

    it("rejects an artifactKey belonging to a different Module as NOT_FOUND", async () => {
      const { actor, attemptId } = await createDraftAttempt("save-cross-module");

      await expect(
        saveArtifactSubmission(actor, {
          attemptId,
          artifactKey: "cross-module-artifact",
          content: "Should not resolve.",
        }),
      ).rejects.toMatchObject({ name: "ServiceError", code: "NOT_FOUND" });
    });

    it("rejects saving once the Attempt is no longer editable", async () => {
      const { actor, attemptId } = await createDraftAttempt("save-not-editable");
      await saveArtifactSubmission(actor, {
        attemptId,
        artifactKey: "verdict",
        content: `# Verdict\n\n${REQUIRED_MARKER}\n`,
      });
      await submitAttempt(actor, { attemptId });

      await expect(
        saveArtifactSubmission(actor, {
          attemptId,
          artifactKey: "verdict",
          content: "Too late.",
        }),
      ).rejects.toMatchObject({ name: "ServiceError", code: "ATTEMPT_NOT_EDITABLE" });
    });
  });

  describe("getArtifactSubmission", () => {
    it("returns null when the Artifact has never been saved", async () => {
      const { actor, attemptId } = await createDraftAttempt("get-artifact-never-saved");

      const result = await getArtifactSubmission(actor, { attemptId, artifactKey: "verdict" });
      expect(result).toBeNull();
    });

    it("returns the submission metadata together with its stored content", async () => {
      const { actor, attemptId } = await createDraftAttempt("get-artifact-content");
      await saveArtifactSubmission(actor, {
        attemptId,
        artifactKey: "verdict",
        content: "# Verdict\n\nHello from the fixture.\n",
      });

      const result = await getArtifactSubmission(actor, { attemptId, artifactKey: "verdict" });

      expect(result).not.toBeNull();
      expect(result?.submission.versionNumber).toBe(1);
      expect(result?.submission.status).toBe("draft");
      expect(result?.content).toBe("# Verdict\n\nHello from the fixture.\n");
    });

    it("returns only the latest (non-superseded) version's content", async () => {
      const { actor, attemptId } = await createDraftAttempt("get-artifact-latest");
      await saveArtifactSubmission(actor, {
        attemptId,
        artifactKey: "verdict",
        content: "# Verdict\n\nVersion one.\n",
      });
      await saveArtifactSubmission(actor, {
        attemptId,
        artifactKey: "verdict",
        content: "# Verdict\n\nVersion two.\n",
      });

      const result = await getArtifactSubmission(actor, { attemptId, artifactKey: "verdict" });

      expect(result?.submission.versionNumber).toBe(2);
      expect(result?.content).toBe("# Verdict\n\nVersion two.\n");
    });

    it("rejects an artifactKey belonging to a different Module as NOT_FOUND", async () => {
      const { actor, attemptId } = await createDraftAttempt("get-artifact-cross-module");

      await expect(
        getArtifactSubmission(actor, { attemptId, artifactKey: "cross-module-artifact" }),
      ).rejects.toMatchObject({ name: "ServiceError", code: "NOT_FOUND" });
    });

    it("rejects a cross-Workspace founder actor as NOT_FOUND", async () => {
      const { attemptId } = await createDraftAttempt("get-artifact-cross-workspace-target");
      const { actor: otherActor } = await createDraftAttempt(
        "get-artifact-cross-workspace-caller",
      );

      await expect(
        getArtifactSubmission(otherActor, { attemptId, artifactKey: "verdict" }),
      ).rejects.toMatchObject({ name: "ServiceError", code: "NOT_FOUND" });
    });
  });

  describe("runDraftCheck", () => {
    it("records a failing check when the content is missing the required marker", async () => {
      const { actor, attemptId } = await createDraftAttempt("draft-check-fail");
      await saveArtifactSubmission(actor, {
        attemptId,
        artifactKey: "verdict",
        content: "# Verdict\n\nIncomplete.\n",
      });

      const validation = await runDraftCheck(
        actor,
        { attemptId, artifactKey: "verdict" },
        FIXTURE_DEPS,
      );

      expect(validation.status).toBe("failed");
      expect(validation.validationKind).toBe("draft_check");
      expect(validation.issues.length).toBeGreaterThan(0);
    });

    it("records a passing check when the content has the required marker", async () => {
      const { actor, attemptId } = await createDraftAttempt("draft-check-pass");
      await saveArtifactSubmission(actor, {
        attemptId,
        artifactKey: "verdict",
        content: `# Verdict\n\n${REQUIRED_MARKER}\n`,
      });

      const validation = await runDraftCheck(
        actor,
        { attemptId, artifactKey: "verdict" },
        FIXTURE_DEPS,
      );

      expect(validation.status).toBe("passed");
      expect(validation.issues).toEqual([]);
    });

    it("throws VALIDATOR_NOT_CONFIGURED when the Artifact has no validator_key", async () => {
      const { actor, attemptId } = await createDraftAttempt("draft-check-no-validator");
      await saveArtifactSubmission(actor, {
        attemptId,
        artifactKey: "no-validator",
        content: "Anything.",
      });

      await expect(
        runDraftCheck(actor, { attemptId, artifactKey: "no-validator" }, FIXTURE_DEPS),
      ).rejects.toMatchObject({ name: "ServiceError", code: "VALIDATOR_NOT_CONFIGURED" });
    });

    it("throws ATTEMPT_NOT_EDITABLE once the Attempt has been submitted", async () => {
      const { actor, attemptId } = await createSubmittedAttempt("draft-check-submitted");

      await expect(
        runDraftCheck(actor, { attemptId, artifactKey: "verdict" }, FIXTURE_DEPS),
      ).rejects.toMatchObject({ name: "ServiceError", code: "ATTEMPT_NOT_EDITABLE" });
    });

    it("writes a complete artifact_validations row (rule_snapshot, terminal status, timestamps)", async () => {
      const { actor, attemptId } = await createDraftAttempt("draft-check-row-integrity");
      const submission = await saveArtifactSubmission(actor, {
        attemptId,
        artifactKey: "verdict",
        content: `# Verdict\n\n${REQUIRED_MARKER}\n`,
      });

      await runDraftCheck(actor, { attemptId, artifactKey: "verdict" }, FIXTURE_DEPS);

      const rows = await getValidationRows(submission.id);
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe("passed");
      expect(rows[0].rule_snapshot).not.toEqual({});
      expect(rows[0].triggered_by_user_id).toBe(actor.userId);
      expect(rows[0].started_at).not.toBeNull();
      expect(rows[0].completed_at).not.toBeNull();
    });

    it("appends a new history row on every call, with no status side effects", async () => {
      const { actor, attemptId } = await createDraftAttempt("draft-check-repeat");
      const submission = await saveArtifactSubmission(actor, {
        attemptId,
        artifactKey: "verdict",
        content: `# Verdict\n\n${REQUIRED_MARKER}\n`,
      });

      await runDraftCheck(actor, { attemptId, artifactKey: "verdict" }, FIXTURE_DEPS);
      await runDraftCheck(actor, { attemptId, artifactKey: "verdict" }, FIXTURE_DEPS);

      const rows = await getValidationRows(submission.id);
      expect(rows.map((row) => row.validation_number)).toEqual([1, 2]);

      // runDraftCheck never itself drives draft -> in_progress (only
      // saveFounderResponse does — see attempt/index.ts's saveFounderResponse);
      // this Attempt has no saved Response, so it is expected to still be
      // 'draft'. The real assertion is "still editable", not the exact value.
      const status = await getAttemptStatus(attemptId);
      expect(["draft", "in_progress"]).toContain(status);
    });

    it("serializes two concurrent draft checks into sequential validation_number values", async () => {
      const { actor, attemptId } = await createDraftAttempt("draft-check-concurrent");
      const submission = await saveArtifactSubmission(actor, {
        attemptId,
        artifactKey: "verdict",
        content: `# Verdict\n\n${REQUIRED_MARKER}\n`,
      });

      await Promise.all([
        runDraftCheck(actor, { attemptId, artifactKey: "verdict" }, FIXTURE_DEPS),
        runDraftCheck(actor, { attemptId, artifactKey: "verdict" }, FIXTURE_DEPS),
      ]);

      const rows = await getValidationRows(submission.id);
      expect(rows).toHaveLength(2);
      expect(rows.map((row) => row.validation_number).sort()).toEqual([1, 2]);
    });
  });

  describe("getLatestValidation", () => {
    it("returns the most recent validation result for (attempt, artifactKey)", async () => {
      const { actor, attemptId } = await createDraftAttempt("get-latest");
      await saveArtifactSubmission(actor, {
        attemptId,
        artifactKey: "verdict",
        content: `# Verdict\n\n${REQUIRED_MARKER}\n`,
      });
      await runDraftCheck(actor, { attemptId, artifactKey: "verdict" }, FIXTURE_DEPS);

      const latest = await getLatestValidation(actor, { attemptId, artifactKey: "verdict" });

      expect(latest).not.toBeNull();
      expect(latest?.status).toBe("passed");
    });

    it("returns null when no validation has ever been run", async () => {
      const { actor, attemptId } = await createDraftAttempt("get-latest-none");
      await saveArtifactSubmission(actor, {
        attemptId,
        artifactKey: "verdict",
        content: "Never checked.",
      });

      const latest = await getLatestValidation(actor, { attemptId, artifactKey: "verdict" });
      expect(latest).toBeNull();
    });

    it("rejects a cross-Workspace founder actor as NOT_FOUND", async () => {
      const { attemptId } = await createDraftAttempt("get-latest-cross-workspace-target");
      const { actor: otherActor } = await createDraftAttempt("get-latest-cross-workspace-caller");

      await expect(
        getLatestValidation(otherActor, { attemptId, artifactKey: "verdict" }),
      ).rejects.toMatchObject({ name: "ServiceError", code: "NOT_FOUND" });
    });
  });

  describe("runOfficialValidation", () => {
    it("rejects a web-sourced founder actor as FORBIDDEN", async () => {
      await expect(
        runOfficialValidation(webFounderActor(randomUUID()), { attemptId: randomUUID() }),
      ).rejects.toMatchObject({ name: "ServiceError", code: "FORBIDDEN" });
    });

    it("rejects an mcp-sourced founder actor as FORBIDDEN", async () => {
      await expect(
        runOfficialValidation(mcpFounderActor(randomUUID()), { attemptId: randomUUID() }),
      ).rejects.toMatchObject({ name: "ServiceError", code: "FORBIDDEN" });
    });

    it("throws ATTEMPT_NOT_AWAITING_VALIDATION for a non-submitted Attempt", async () => {
      const { attemptId } = await createDraftAttempt("official-not-submitted");
      const systemUserId = await createTrustedUser("official-not-submitted-system");

      await expect(
        runOfficialValidation(systemActor(systemUserId), { attemptId }, FIXTURE_DEPS),
      ).rejects.toMatchObject({ name: "ServiceError", code: "ATTEMPT_NOT_AWAITING_VALIDATION" });
    });

    it("passes for a system actor, moving the Attempt to ready_for_review without touching program_run_modules", async () => {
      const { attemptId, availableModuleId } = await createSubmittedAttempt(
        "official-pass-system",
        "proceed",
      );
      const systemUserId = await createTrustedUser("official-pass-system-actor");
      const runModuleBefore = await getRunModuleRow(availableModuleId);

      const result = await runOfficialValidation(
        systemActor(systemUserId),
        { attemptId },
        FIXTURE_DEPS,
      );

      expect(result.passed).toBe(true);
      expect(result.status).toBe("ready_for_review");
      expect(result.validations).toHaveLength(1);

      const status = await getAttemptStatus(attemptId);
      expect(status).toBe("ready_for_review");

      const runModuleAfter = await getRunModuleRow(availableModuleId);
      expect(runModuleAfter.status).toBe(runModuleBefore.status);
      expect(runModuleAfter.status).toBe("in_progress");
      expect(runModuleAfter.active_attempt_id).toBe(attemptId);

      const submissionsResult = await pool.query<{ status: string }>(
        `select status from artifact_submissions where module_attempt_id = $1`,
        [attemptId],
      );
      expect(submissionsResult.rows.every((row) => row.status === "submitted")).toBe(true);

      expect(await getEventTypes(attemptId)).toEqual([
        "attempt_started",
        "artifact_uploaded",
        "response_saved",
        "attempt_submitted",
        "validation_started",
        "validation_passed",
      ]);
    });

    it("passes for an admin actor", async () => {
      const { attemptId } = await createSubmittedAttempt("official-pass-admin", "proceed");
      const adminUserId = await createTrustedUser("official-pass-admin-actor");

      const result = await runOfficialValidation(adminActor(adminUserId), { attemptId }, FIXTURE_DEPS);

      expect(result.passed).toBe(true);
      const rows = await getValidationRows(result.validations[0].artifactSubmissionId);
      expect(rows[0].triggered_by_user_id).toBe(adminUserId);
    });

    it("fails and clears active_attempt_id when the fixture Validator's official rule fails", async () => {
      const { attemptId, availableModuleId } = await createSubmittedAttempt(
        "official-fail",
        "pivot",
      );
      const systemUserId = await createTrustedUser("official-fail-actor");

      const result = await runOfficialValidation(
        systemActor(systemUserId),
        { attemptId },
        FIXTURE_DEPS,
      );

      expect(result.passed).toBe(false);
      expect(result.status).toBe("validation_failed");

      const status = await getAttemptStatus(attemptId);
      expect(status).toBe("validation_failed");

      const runModule = await getRunModuleRow(availableModuleId);
      expect(runModule.active_attempt_id).toBeNull();

      const submissionsResult = await pool.query<{ status: string }>(
        `select status from artifact_submissions where module_attempt_id = $1`,
        [attemptId],
      );
      expect(submissionsResult.rows.every((row) => row.status === "draft")).toBe(true);

      expect(await getEventTypes(attemptId)).toEqual([
        "attempt_started",
        "artifact_uploaded",
        "response_saved",
        "attempt_submitted",
        "validation_started",
        "validation_failed",
      ]);
    });

    it("fails with a missingArtifactKeys entry when a required Artifact was never saved", async () => {
      const context = await createRunWithModules("official-missing-artifact", PROGRAM_KEY_MULTI, {
        available: "artifact-module-multi",
      });
      const created = await startOrResumeAttempt(context.actor, {
        programRunModuleId: context.availableModuleId,
      });
      await saveArtifactSubmission(context.actor, {
        attemptId: created.attempt.id,
        artifactKey: "verdict-1",
        content: `# Verdict\n\n${REQUIRED_MARKER}\n`,
      });
      await saveFounderResponse(context.actor, {
        attemptId: created.attempt.id,
        questionKey: "final_decision",
        value: "proceed",
      });
      await submitAttempt(context.actor, { attemptId: created.attempt.id });
      const systemUserId = await createTrustedUser("official-missing-artifact-actor");

      const result = await runOfficialValidation(
        systemActor(systemUserId),
        { attemptId: created.attempt.id },
        FIXTURE_DEPS,
      );

      expect(result.passed).toBe(false);
      expect(result.missingArtifactKeys).toEqual(["verdict-2"]);
      // Only one artifact_validations row (verdict-1's) — there is no
      // submission for verdict-2 to attach a row to.
      expect(result.validations).toHaveLength(1);
    });

    it("is idempotent once ready_for_review — a second call performs no new writes", async () => {
      const { attemptId } = await createSubmittedAttempt("official-idempotent-pass", "proceed");
      const systemUserId = await createTrustedUser("official-idempotent-pass-actor");

      await runOfficialValidation(systemActor(systemUserId), { attemptId }, FIXTURE_DEPS);
      const eventsBefore = await getEventTypes(attemptId);

      const second = await runOfficialValidation(
        systemActor(systemUserId),
        { attemptId },
        FIXTURE_DEPS,
      );

      expect(second.passed).toBe(true);
      expect(second.status).toBe("ready_for_review");
      expect(await getEventTypes(attemptId)).toEqual(eventsBefore);
    });

    it("is idempotent once validation_failed — a second call performs no new writes", async () => {
      const { attemptId } = await createSubmittedAttempt("official-idempotent-fail", "pivot");
      const systemUserId = await createTrustedUser("official-idempotent-fail-actor");

      await runOfficialValidation(systemActor(systemUserId), { attemptId }, FIXTURE_DEPS);
      const eventsBefore = await getEventTypes(attemptId);

      const second = await runOfficialValidation(
        systemActor(systemUserId),
        { attemptId },
        FIXTURE_DEPS,
      );

      expect(second.passed).toBe(false);
      expect(second.status).toBe("validation_failed");
      expect(await getEventTypes(attemptId)).toEqual(eventsBefore);
    });
  });

  describe("Retry regression (validation_failed clears active_attempt_id)", () => {
    it("allows startOrResumeAttempt({ basedOnAttemptId }) to create a Retry after an official failure", async () => {
      const { actor, attemptId, availableModuleId } = await createSubmittedAttempt(
        "retry-regression",
        "pivot",
      );
      const systemUserId = await createTrustedUser("retry-regression-actor");

      const validationResult = await runOfficialValidation(
        systemActor(systemUserId),
        { attemptId },
        FIXTURE_DEPS,
      );
      expect(validationResult.status).toBe("validation_failed");

      const retryResult = await startOrResumeAttempt(actor, {
        programRunModuleId: availableModuleId,
        basedOnAttemptId: attemptId,
      });

      expect(retryResult.created).toBe(true);
      expect(retryResult.attempt.attemptType).toBe("retry");
      expect(retryResult.attempt.basedOnAttemptId).toBe(attemptId);

      const runModule = await getRunModuleRow(availableModuleId);
      expect(runModule.active_attempt_id).toBe(retryResult.attempt.id);
    });
  });
});
