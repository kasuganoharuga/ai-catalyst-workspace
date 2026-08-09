import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { saveArtifactSubmission } from "@ai-catalyst/services/artifact";
import { startOrResumeAttempt } from "@ai-catalyst/services/attempt";
import { seedToolkitContent } from "@ai-catalyst/services/content-seed";
import type { ToolkitSeedContent } from "@ai-catalyst/services/content-seed";
import { completeModuleAttempt } from "@ai-catalyst/services/module/completion";
import { getOrCreateProgramRun } from "@ai-catalyst/services/workflow";
import {
  createFixtureFounderAccount,
  createFixtureVenture,
  withTransaction,
} from "@ai-catalyst/services/testing/db-fixtures";

import {
  INTERVIEW_MINIMUM_COUNT,
  MODULE_4_KEY,
  addInterviewRecord,
  completeInterviewRecord,
  confirmInterviewEvidence,
  createInterviewActivityFromGuide,
  reopenInterviewEvidence,
  reopenInterviewRecord,
  submitInterviewSetForReview,
} from "./index.js";

type FixtureModule = ToolkitSeedContent["modules"][number];

function webFounderActor(userId: string): ActorContext {
  return { userId, role: "founder", source: "web" };
}

const QUESTIONS = [
  { index: 1, text: "What problem are you solving today?" },
  { index: 2, text: "What have you tried already?" },
];

function buildFixtureModule(
  moduleKey: string,
  sequenceIndex: number,
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
    // Publishable modules need at least one question or artifact.
    questions:
      moduleKey === MODULE_4_KEY
        ? []
        : [
            {
              questionKey: "fixture_note",
              sequenceIndex: 1,
              questionGroup: null,
              questionText: "Fixture question for publishable Module 3.",
              helpText: null,
              placeholderText: null,
              responseType: "long_text",
              isRequired: false,
              allowSkip: true,
              options: [],
              conditions: {},
            },
          ],
    artifacts:
      moduleKey === MODULE_4_KEY
        ? [
            {
              artifactKey: "interview_evidence",
              sequenceIndex: 1,
              name: "Customer Interview Evidence",
              description: null,
              isRequired: false,
              artifactType: "document",
              sourceFormat: "markdown",
              outputFormat: "markdown",
              requiredFilename: "Interview-Evidence.md",
              rendererKey: null,
              validatorKey: null,
              allowedMimeTypes: ["text/markdown", "text/plain"],
              maxFileSizeBytes: 262_144,
              maxFiles: 1,
              validationConfig: {},
              outputConfig: {
                schemaVersion: 1,
                templateFormat: "markdown",
                templateMarkdown: "# Customer Interview Evidence\n",
              },
            },
            {
              artifactKey: "evidence_of_unmet_need",
              sequenceIndex: 2,
              name: "Evidence of Unmet Need",
              description: null,
              isRequired: true,
              artifactType: "document",
              sourceFormat: "markdown",
              outputFormat: "markdown",
              requiredFilename: "Evidence-Of-Unmet-Need.md",
              rendererKey: "evidence_of_unmet_need_html_v1",
              validatorKey: null,
              allowedMimeTypes: ["text/markdown", "text/plain"],
              maxFileSizeBytes: 262_144,
              maxFiles: 1,
              validationConfig: {},
              outputConfig: {
                schemaVersion: 1,
                templateFormat: "markdown",
                templateMarkdown: "# Evidence of Unmet Need\n",
              },
            },
          ]
        : [],
  };
}

describe("interview evidence lifecycle — database integration", () => {
  const RUN_SUFFIX = randomBytes(4).toString("hex");
  const emailPrefix = `interview-test-${RUN_SUFFIX}`;
  const PROGRAM_KEY = `interview-service-${RUN_SUFFIX}`;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    await withTransaction((client) =>
      seedToolkitContent(client, {
        program: {
          programKey: PROGRAM_KEY,
          programName: `Interview service test ${PROGRAM_KEY}`,
          programDescription: null,
          versionNumber: 1,
          versionLabel: `v1-${PROGRAM_KEY}`,
          versionName: `Fixture v1 ${PROGRAM_KEY}`,
          versionDescription: null,
          contentLock: "frozen",
          releaseNotes: null,
        },
        modules: [
          buildFixtureModule("interview-module-03", 0),
          buildFixtureModule(MODULE_4_KEY, 1),
        ],
        prompts: [],
        promptBindings: [],
      }),
    );
  });

  afterAll(async () => {
    // Tear down workspace-scoped rows before ventures cascade into
    // program_run_modules (artifact_submissions FK would otherwise block).
    // Clear the pin first: the composite FK ON DELETE SET NULL would also
    // null workspace_id on module_attempts if we delete submissions while pinned.
    await pool.query(
      `update module_attempts
       set source_interview_evidence_artifact_id = null
       where workspace_id in (
         select id from workspaces where founder_user_id = any($1::uuid[])
       )`,
      [createdUserIds],
    );
    await pool.query(
      `update interview_activities
       set confirmed_artifact_submission_id = null
       where workspace_id in (
         select id from workspaces where founder_user_id = any($1::uuid[])
       )`,
      [createdUserIds],
    );
    await pool.query(
      `delete from artifact_files
       where workspace_id in (
         select id from workspaces where founder_user_id = any($1::uuid[])
       )`,
      [createdUserIds],
    );
    await pool.query(
      `delete from artifact_submissions
       where workspace_id in (
         select id from workspaces where founder_user_id = any($1::uuid[])
       )`,
      [createdUserIds],
    );
    await pool.query(
      `delete from interview_records
       where workspace_id in (
         select id from workspaces where founder_user_id = any($1::uuid[])
       )`,
      [createdUserIds],
    );
    await pool.query(
      `delete from interview_activities
       where workspace_id in (
         select id from workspaces where founder_user_id = any($1::uuid[])
       )`,
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

  async function createHarness(label: string): Promise<{
    actor: ActorContext;
    workspaceId: string;
    programRunId: string;
    module4Id: string;
    activityId: string;
  }> {
    const { userId, workspaceId } = await createFixtureFounderAccount({
      label,
      emailPrefix,
      slugPrefix: "interview-service",
    });
    createdUserIds.push(userId);
    const ventureId = await createFixtureVenture({
      workspaceId,
      createdByUserId: userId,
      label,
      slugPrefix: "interview-service-venture",
    });
    const actor = webFounderActor(userId);
    const result = await getOrCreateProgramRun(
      actor,
      { ventureId },
      { programKey: PROGRAM_KEY },
    );
    const programRunId = result.run.id;

    const modules = await pool.query<{ id: string; module_key: string }>(
      `select id, module_key from program_run_modules
       where program_run_id = $1
       order by sequence_index`,
      [programRunId],
    );
    const module3 = modules.rows.find(
      (row) => row.module_key === "interview-module-03",
    );
    const module4 = modules.rows.find((row) => row.module_key === MODULE_4_KEY);
    if (!module3 || !module4) {
      throw new Error("Fixture program_run_modules missing expected modules.");
    }

    await pool.query(
      `update program_run_modules set status = 'available' where id = $1`,
      [module4.id],
    );

    const sourceAttempt = await startOrResumeAttempt(actor, {
      programRunModuleId: module3.id,
    });

    const activity = await withTransaction((client) =>
      createInterviewActivityFromGuide({
        client,
        workspaceId,
        programRunId,
        sourceModuleAttemptId: sourceAttempt.attempt.id,
        questions: QUESTIONS,
      }),
    );

    return {
      actor,
      workspaceId,
      programRunId,
      module4Id: module4.id,
      activityId: activity.id,
    };
  }

  async function fillCompletedSet(
    actor: ActorContext,
    activityId: string,
  ): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < INTERVIEW_MINIMUM_COUNT; i += 1) {
      const record = await addInterviewRecord(actor, activityId);
      ids.push(record.id);
      await completeInterviewRecord(actor, record.id, {
        intervieweeName: `Person ${i + 1}`,
        company: `Co ${i + 1}`,
        role: "Founder",
        interviewedAt: "2026-01-15",
        answers: {
          "1": `Answer one for interview ${i + 1}`,
          "2": `Answer two for interview ${i + 1}`,
        },
        keyQuote: null,
        currentWorkaround: null,
      });
    }
    return ids;
  }

  it("after submitted, editing an interview returns the set to draft and clears evidence_submitted_at", async () => {
    const { actor, programRunId, activityId } =
      await createHarness("submit-edit");
    const recordIds = await fillCompletedSet(actor, activityId);

    const submitted = await submitInterviewSetForReview(actor, programRunId);
    expect(submitted.evidenceStatus).toBe("submitted");
    expect(submitted.evidenceSubmittedAt).not.toBeNull();

    await reopenInterviewRecord(actor, recordIds[0]!);

    const activity = await pool.query<{
      evidence_status: string;
      evidence_submitted_at: Date | null;
    }>(
      `select evidence_status, evidence_submitted_at
       from interview_activities where id = $1`,
      [activityId],
    );
    expect(activity.rows[0]?.evidence_status).toBe("draft");
    expect(activity.rows[0]?.evidence_submitted_at).toBeNull();
  });

  it("confirmed but not pinned can reopen evidence back to draft", async () => {
    const { actor, programRunId, activityId } =
      await createHarness("reopen-unpinned");
    await fillCompletedSet(actor, activityId);
    await submitInterviewSetForReview(actor, programRunId);
    const confirmed = await confirmInterviewEvidence(actor, programRunId);
    expect(confirmed.evidenceStatus).toBe("confirmed");

    const reopened = await reopenInterviewEvidence(actor, programRunId);
    expect(reopened.evidenceStatus).toBe("draft");
    expect(reopened.evidenceSubmittedAt).toBeNull();
    expect(reopened.evidenceConfirmedAt).toBeNull();

    const activity = await pool.query<{ evidence_status: string }>(
      `select evidence_status from interview_activities where id = $1`,
      [activityId],
    );
    expect(activity.rows[0]?.evidence_status).toBe("draft");
  });

  it("after pin, edit and reopen are refused with EVIDENCE_FROZEN_FOR_ATTEMPT", async () => {
    const { actor, programRunId, module4Id, activityId } =
      await createHarness("pin-freeze");
    const recordIds = await fillCompletedSet(actor, activityId);
    await submitInterviewSetForReview(actor, programRunId);
    await confirmInterviewEvidence(actor, programRunId);

    const started = await startOrResumeAttempt(actor, {
      programRunModuleId: module4Id,
    });
    const submission = await saveArtifactSubmission(actor, {
      attemptId: started.attempt.id,
      artifactKey: "interview_evidence",
      content: "# pinned evidence\n",
    });

    await pool.query(
      `update module_attempts
       set source_interview_evidence_artifact_id = $2
       where id = $1`,
      [started.attempt.id, submission.id],
    );

    await expect(
      reopenInterviewRecord(actor, recordIds[0]!),
    ).rejects.toMatchObject({ code: "EVIDENCE_FROZEN_FOR_ATTEMPT" });
    await expect(
      reopenInterviewEvidence(actor, programRunId),
    ).rejects.toMatchObject({ code: "EVIDENCE_FROZEN_FOR_ATTEMPT" });
    await expect(
      submitInterviewSetForReview(actor, programRunId),
    ).rejects.toMatchObject({ code: "EVIDENCE_FROZEN_FOR_ATTEMPT" });
  });

  it("complete_module without this attempt's pin throws MODULE_4_INTERVIEW_EVIDENCE_MISSING", async () => {
    const { actor, workspaceId, programRunId, module4Id, activityId } =
      await createHarness("complete-no-pin");
    await fillCompletedSet(actor, activityId);
    await submitInterviewSetForReview(actor, programRunId);
    await confirmInterviewEvidence(actor, programRunId);

    // startOrResumeAttempt auto-pins confirmed evidence — clear it to prove
    // complete_module refuses confirmed-but-unpinned activity alone.
    const started = await startOrResumeAttempt(actor, {
      programRunModuleId: module4Id,
    });
    await pool.query(
      `update module_attempts
       set source_interview_evidence_artifact_id = null
       where id = $1`,
      [started.attempt.id],
    );

    await expect(
      completeModuleAttempt(actor, { attemptId: started.attempt.id }),
    ).rejects.toMatchObject({
      name: "ServiceError",
      code: "MODULE_4_INTERVIEW_EVIDENCE_MISSING",
    });

    const activity = await pool.query<{ evidence_status: string }>(
      `select evidence_status from interview_activities
       where program_run_id = $1 and workspace_id = $2`,
      [programRunId, workspaceId],
    );
    expect(activity.rows[0]?.evidence_status).toBe("confirmed");
  });
});
