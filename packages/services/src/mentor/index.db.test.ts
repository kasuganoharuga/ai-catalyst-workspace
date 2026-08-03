import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type { ToolkitSeedContent } from "@ai-catalyst/services/content-seed";
import { seedFixtureProgram } from "@ai-catalyst/services/testing/db-fixtures";
import { getOrCreateProgramRun } from "@ai-catalyst/services/workflow";
import { saveArtifactSubmission } from "@ai-catalyst/services/artifact";
import { startOrResumeAttempt } from "@ai-catalyst/services/attempt";

import {
  getMentorArtefactDocument,
  getMentorFounderDetail,
  listMentorFounders,
} from "./index.js";

/**
 * Integration tests against the real Postgres database, following the fixture
 * pattern in artifact/index.db.test.ts: a fixture Program seeded through the
 * real reconciler, a real Run created through getOrCreateProgramRun, and a
 * real Artifact saved through saveArtifactSubmission — then read back from
 * the Mentor side.
 *
 * The negative cases carry most of the weight here. This surface exists to
 * show one Mentor another person's business, so "mentor B cannot see mentor
 * A's Founder" is the property under test, not an afterthought.
 */
describe("mentor service — database integration", () => {
  const RUN_SUFFIX = randomBytes(4).toString("hex");
  const emailPrefix = `mentor-test-${RUN_SUFFIX}`;
  const PROGRAM_KEY = `mentor-service-${RUN_SUFFIX}`;
  const ARTIFACT_KEY = "verdict";
  const UNSAVED_ARTIFACT_KEY = "plan";
  const MODULE_KEY = "module-a";
  const ARTIFACT_CONTENT = "# Fixture verdict\n\nBody text.\n";

  const createdUserIds: string[] = [];

  function fixtureContent(): ToolkitSeedContent {
    return {
      program: {
        programKey: PROGRAM_KEY,
        programName: `Mentor service test program ${PROGRAM_KEY}`,
        programDescription: null,
        versionNumber: 1,
        versionLabel: `v1-${PROGRAM_KEY}`,
        versionName: `Fixture v1 ${PROGRAM_KEY}`,
        versionDescription: null,
        releaseNotes: null,
      },
      modules: [
        {
          moduleKey: MODULE_KEY,
          sequenceIndex: 1,
          title: "Fixture module A",
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
          artifacts: [
            {
              artifactKey: ARTIFACT_KEY,
              sequenceIndex: 1,
              name: "Fixture verdict",
              description: null,
              isRequired: true,
              artifactType: "document",
              sourceFormat: "markdown",
              outputFormat: "markdown",
              requiredFilename: "Verdict.md",
              rendererKey: null,
              validatorKey: null,
              allowedMimeTypes: ["text/markdown"],
              maxFileSizeBytes: 262_144,
              maxFiles: 1,
              validationConfig: {},
              outputConfig: {},
            },
          ],
        },
        {
          moduleKey: "module-b",
          sequenceIndex: 2,
          title: "Fixture module B",
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
          // Defined but never saved by any fixture Founder — this is what
          // makes "the module exists, the deliverable is expected, nothing
          // has been produced" a real state to test against.
          artifacts: [
            {
              artifactKey: UNSAVED_ARTIFACT_KEY,
              sequenceIndex: 1,
              name: "Fixture plan",
              description: null,
              isRequired: true,
              artifactType: "document",
              sourceFormat: "markdown",
              outputFormat: "markdown",
              requiredFilename: "Plan.md",
              rendererKey: null,
              validatorKey: null,
              allowedMimeTypes: ["text/markdown"],
              maxFileSizeBytes: 262_144,
              maxFiles: 1,
              validationConfig: {},
              outputConfig: {},
            },
          ],
        },
      ],
      prompts: [],
      promptBindings: [],
    };
  }

  async function createUser(
    label: string,
    role: "founder" | "mentor",
  ): Promise<string> {
    const email = `${emailPrefix}-${label}-${randomUUID()}@example.com`;
    const result = await pool.query<{ id: string }>(
      "insert into users (name, email, role) values ($1, $2, $3) returning id",
      [`${emailPrefix}-${label}`, email, role],
    );
    createdUserIds.push(result.rows[0].id);
    return result.rows[0].id;
  }

  function mentorActor(userId: string): ActorContext {
    return { userId, role: "mentor", source: "web" };
  }

  /** A Founder with a Workspace and Venture, optionally under a Mentor. */
  async function createFounder(
    label: string,
    mentorUserId: string | null,
  ): Promise<{ actor: ActorContext; workspaceId: string; ventureId: string }> {
    const userId = await createUser(label, "founder");
    const actor: ActorContext = { userId, role: "founder", source: "web" };

    const workspaceResult = await pool.query<{ id: string }>(
      `insert into workspaces (founder_user_id, name, slug, mentor_user_id)
       values ($1, $2, $3, $4) returning id`,
      [
        userId,
        `Fixture ${label}`,
        `mentor-service-${label}-${randomUUID()}`,
        mentorUserId,
      ],
    );
    const workspaceId = workspaceResult.rows[0].id;

    const ventureResult = await pool.query<{ id: string }>(
      `insert into ventures (workspace_id, created_by_user_id, name, slug)
       values ($1, $2, $3, $4) returning id`,
      [
        workspaceId,
        userId,
        `Fixture Venture ${label}`,
        `mentor-service-venture-${label}-${randomUUID()}`,
      ],
    );

    return { actor, workspaceId, ventureId: ventureResult.rows[0].id };
  }

  /** Takes a Founder all the way to one saved Artifact on module A. */
  async function createFounderWithSavedArtefact(
    label: string,
    mentorUserId: string | null,
  ) {
    const founder = await createFounder(label, mentorUserId);
    const run = await getOrCreateProgramRun(
      founder.actor,
      { ventureId: founder.ventureId },
      { programKey: PROGRAM_KEY },
    );

    const moduleResult = await pool.query<{ id: string }>(
      `select id from program_run_modules
       where program_run_branch_id = $1 and module_key = $2`,
      [run.run.activeBranchId, MODULE_KEY],
    );

    const attempt = await startOrResumeAttempt(founder.actor, {
      programRunModuleId: moduleResult.rows[0].id,
    });
    await saveArtifactSubmission(founder.actor, {
      attemptId: attempt.attempt.id,
      artifactKey: ARTIFACT_KEY,
      content: ARTIFACT_CONTENT,
    });

    return { ...founder, runId: run.run.id };
  }

  beforeAll(async () => {
    await seedFixtureProgram(fixtureContent());
  });

  afterAll(async () => {
    // Same ordering rationale as artifact/index.db.test.ts: the
    // artifact_submissions -> program_run_modules FK does not cascade, so it
    // must go before the venture cascade rather than racing it.
    await pool.query(
      "delete from artifact_submissions where workspace_id in (select id from workspaces where founder_user_id = any($1::uuid[]))",
      [createdUserIds],
    );
    await pool.query(
      "delete from ventures where workspace_id in (select id from workspaces where founder_user_id = any($1::uuid[]))",
      [createdUserIds],
    );
    await pool.query(
      "delete from user_active_contexts where user_id = any($1::uuid[])",
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

  describe("listMentorFounders", () => {
    it("lists only the founders this mentor covers", async () => {
      const mentorA = await createUser("list-a", "mentor");
      const mentorB = await createUser("list-b", "mentor");
      const mine = await createFounder("list-mine", mentorA);
      const theirs = await createFounder("list-theirs", mentorB);
      const unmentored = await createFounder("list-orphan", null);

      const rows = await listMentorFounders(mentorActor(mentorA));
      const workspaceIds = rows.map((row) => row.workspaceId);

      expect(workspaceIds).toContain(mine.workspaceId);
      expect(workspaceIds).not.toContain(theirs.workspaceId);
      expect(workspaceIds).not.toContain(unmentored.workspaceId);
    });

    // "Never started" must stay distinguishable from "started, done nothing".
    it("reports null counts for a founder with no run yet", async () => {
      const mentor = await createUser("counts-none", "mentor");
      const founder = await createFounder("counts-none-founder", mentor);

      const rows = await listMentorFounders(mentorActor(mentor));
      const row = rows.find((r) => r.workspaceId === founder.workspaceId);

      expect(row?.totalModules).toBeNull();
      expect(row?.completedModules).toBeNull();
      expect(row?.lastCompletedAt).toBeNull();
    });

    it("counts modules once a run exists", async () => {
      const mentor = await createUser("counts-run", "mentor");
      const founder = await createFounderWithSavedArtefact(
        "counts-run-founder",
        mentor,
      );

      const rows = await listMentorFounders(mentorActor(mentor));
      const row = rows.find((r) => r.workspaceId === founder.workspaceId);

      expect(row?.totalModules).toBe(2);
      expect(row?.completedModules).toBe(0);
    });

    it("refuses a non-mentor actor", async () => {
      const founder = await createFounder("list-guard", null);
      await expect(listMentorFounders(founder.actor)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });
  });

  describe("getMentorFounderDetail", () => {
    it("returns modules and saved artefacts for a covered founder", async () => {
      const mentor = await createUser("detail", "mentor");
      const founder = await createFounderWithSavedArtefact(
        "detail-founder",
        mentor,
      );

      const detail = await getMentorFounderDetail(
        mentorActor(mentor),
        founder.workspaceId,
      );

      expect(detail.modules.map((m) => m.moduleKey)).toEqual([
        MODULE_KEY,
        "module-b",
      ]);
      expect(detail.artefacts).toHaveLength(1);
      expect(detail.artefacts[0]).toMatchObject({
        moduleKey: MODULE_KEY,
        artifactKey: ARTIFACT_KEY,
        versionNumber: 1,
      });
      expect(detail.founder.totalModules).toBe(2);
    });

    // The visibility ceiling, asserted structurally: a Mentor reads finished
    // work, never the Founder's raw answers.
    it("never exposes module_responses", async () => {
      const mentor = await createUser("detail-privacy", "mentor");
      const founder = await createFounderWithSavedArtefact(
        "detail-privacy-founder",
        mentor,
      );

      const detail = await getMentorFounderDetail(
        mentorActor(mentor),
        founder.workspaceId,
      );

      expect(JSON.stringify(detail)).not.toContain("responses");
    });

    it("renders a founder who has not started as empty rather than failing", async () => {
      const mentor = await createUser("detail-nostart", "mentor");
      const founder = await createFounder("detail-nostart-founder", mentor);

      const detail = await getMentorFounderDetail(
        mentorActor(mentor),
        founder.workspaceId,
      );

      expect(detail.modules).toEqual([]);
      expect(detail.artefacts).toEqual([]);
    });

    it("hides another mentor's founder as not found", async () => {
      const mentorA = await createUser("detail-a", "mentor");
      const mentorB = await createUser("detail-b", "mentor");
      const founder = await createFounderWithSavedArtefact(
        "detail-cross",
        mentorA,
      );

      await expect(
        getMentorFounderDetail(mentorActor(mentorB), founder.workspaceId),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("treats a malformed workspace id as not found", async () => {
      const mentor = await createUser("detail-badid", "mentor");
      await expect(
        getMentorFounderDetail(mentorActor(mentor), "not-a-uuid"),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("getMentorArtefactDocument", () => {
    it("returns the saved artefact body", async () => {
      const mentor = await createUser("doc", "mentor");
      const founder = await createFounderWithSavedArtefact("doc-founder", mentor);

      const document = await getMentorArtefactDocument(
        mentorActor(mentor),
        founder.workspaceId,
        MODULE_KEY,
        ARTIFACT_KEY,
      );

      expect(document?.content).toBe(ARTIFACT_CONTENT);
      expect(document?.versionNumber).toBe(1);
      expect(document?.moduleTitle).toBe("Fixture module A");
    });

    it("returns null for a module with nothing saved yet", async () => {
      const mentor = await createUser("doc-empty", "mentor");
      const founder = await createFounderWithSavedArtefact(
        "doc-empty-founder",
        mentor,
      );

      await expect(
        getMentorArtefactDocument(
          mentorActor(mentor),
          founder.workspaceId,
          "module-b",
          UNSAVED_ARTIFACT_KEY,
        ),
      ).resolves.toBeNull();
    });

    it("hides another mentor's artefact as not found", async () => {
      const mentorA = await createUser("doc-a", "mentor");
      const mentorB = await createUser("doc-b", "mentor");
      const founder = await createFounderWithSavedArtefact("doc-cross", mentorA);

      await expect(
        getMentorArtefactDocument(
          mentorActor(mentorB),
          founder.workspaceId,
          MODULE_KEY,
          ARTIFACT_KEY,
        ),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("refuses a founder actor outright", async () => {
      const mentor = await createUser("doc-guard", "mentor");
      const founder = await createFounderWithSavedArtefact(
        "doc-guard-founder",
        mentor,
      );

      await expect(
        getMentorArtefactDocument(
          founder.actor,
          founder.workspaceId,
          MODULE_KEY,
          ARTIFACT_KEY,
        ),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });
});
