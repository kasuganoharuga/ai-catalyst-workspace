import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type { ToolkitSeedContent } from "@ai-catalyst/services/content-seed";
import { assignWorkspaceMentor } from "@ai-catalyst/services/admin";
import {
  listMentorFounders,
  assertMentorOwnsWorkspace,
} from "@ai-catalyst/services/mentor";
import {
  createFixtureFounderAccount,
  createFixtureVenture,
  cleanupFixtureAccounts,
  seedFixtureProgram,
} from "@ai-catalyst/services/testing/db-fixtures";
import { getOrCreateProgramRun } from "@ai-catalyst/services/workflow";
import { resolveFounderWorkspace } from "@ai-catalyst/services/workspace";

import {
  createFounderSandbox,
  ensureFounderSandbox,
  enterFounderPreview,
  exitFounderPreview,
  resolveFounderPreviewState,
  restartFounderSandbox,
} from "./founder-preview.js";

/**
 * Integration tests against the real Postgres database — same fixture
 * pattern as artifact-comment/index.db.test.ts and mentor/index.db.test.ts:
 * a fixture Program seeded through the real reconciler, real Workspaces via
 * packages/services/src/testing/db-fixtures, and the founder-preview
 * service under test driving everything else.
 *
 * The core property under test: a Mentor previewing the Founder flow is
 * structurally confined to their own sandbox Workspace, no matter what
 * attemptId/ventureId/etc. they hold — proven here by handing a previewing
 * Mentor's actor a *real, different* Founder's ventureId and asserting
 * NOT_FOUND, the same way any cross-Founder access attempt resolves
 * elsewhere in this codebase.
 */
describe("founder-preview service — database integration", () => {
  const RUN_SUFFIX = randomBytes(4).toString("hex");
  const emailPrefix = `founder-preview-test-${RUN_SUFFIX}`;
  const PROGRAM_KEY = `founder-preview-service-${RUN_SUFFIX}`;
  const MODULE_KEY = "module-a";

  const createdUserIds: string[] = [];

  function fixtureContent(): ToolkitSeedContent {
    return {
      program: {
        programKey: PROGRAM_KEY,
        programName: `Founder preview test program ${PROGRAM_KEY}`,
        programDescription: null,
        versionNumber: 1,
        versionLabel: `v1-${PROGRAM_KEY}`,
        versionName: `Fixture v1 ${PROGRAM_KEY}`,
        versionDescription: null,
        contentLock: "frozen",
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
              artifactKey: "verdict",
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
      ],
      prompts: [],
      promptBindings: [],
    };
  }

  async function createMentor(label: string): Promise<{
    userId: string;
    actor: ActorContext;
  }> {
    const email = `${emailPrefix}-${label}-${randomUUID()}@example.com`;
    const result = await pool.query<{ id: string }>(
      "insert into users (name, email, role) values ($1, $2, 'mentor') returning id",
      [`${emailPrefix}-${label}`, email],
    );
    const userId = result.rows[0].id;
    createdUserIds.push(userId);
    return { userId, actor: { userId, role: "mentor", source: "web" } };
  }

  async function createFounderWithVenture(label: string) {
    const account = await createFixtureFounderAccount({
      label,
      emailPrefix,
      slugPrefix: "founder-preview",
    });
    createdUserIds.push(account.userId);
    const ventureId = await createFixtureVenture({
      workspaceId: account.workspaceId,
      createdByUserId: account.userId,
      label,
      slugPrefix: "founder-preview-venture",
    });
    return {
      userId: account.userId,
      workspaceId: account.workspaceId,
      ventureId,
      actor: {
        userId: account.userId,
        role: "founder",
        source: "web",
      } as ActorContext,
    };
  }

  function previewingActor(mentorUserId: string): ActorContext {
    return {
      userId: mentorUserId,
      role: "mentor",
      source: "web",
      actingAs: "founder",
    };
  }

  async function fetchWorkspaceRow(workspaceId: string) {
    const result = await pool.query<{
      kind: string;
      mentor_user_id: string | null;
    }>(`select kind, mentor_user_id from workspaces where id = $1`, [
      workspaceId,
    ]);
    return result.rows[0];
  }

  beforeAll(async () => {
    await seedFixtureProgram(fixtureContent());
  });

  afterAll(async () => {
    await cleanupFixtureAccounts({
      userIds: createdUserIds,
      programKey: PROGRAM_KEY,
    });
  });

  describe("resolveFounderPreviewState", () => {
    it("reports no sandbox for a Mentor who has never requested one", async () => {
      const mentor = await createMentor("state-fresh");
      const state = await resolveFounderPreviewState(mentor.userId);
      expect(state).toEqual({
        hasSandbox: false,
        sandboxWorkspaceId: null,
        previewEnabled: false,
      });
    });

    it("tracks hasSandbox and previewEnabled independently through ensure/enter/exit", async () => {
      const mentor = await createMentor("state-lifecycle");

      const { workspaceId } = await ensureFounderSandbox(mentor.actor);
      const afterEnsure = await resolveFounderPreviewState(mentor.userId);
      expect(afterEnsure).toEqual({
        hasSandbox: true,
        sandboxWorkspaceId: workspaceId,
        previewEnabled: false,
      });

      await enterFounderPreview(mentor.actor);
      expect(
        (await resolveFounderPreviewState(mentor.userId)).previewEnabled,
      ).toBe(true);

      await exitFounderPreview(mentor.actor);
      const afterExit = await resolveFounderPreviewState(mentor.userId);
      expect(afterExit.previewEnabled).toBe(false);
      expect(afterExit.hasSandbox).toBe(true);
    });
  });

  describe("ensureFounderSandbox", () => {
    it("is idempotent — repeated calls return the same Workspace/Venture", async () => {
      const mentor = await createMentor("ensure-idempotent");
      const first = await ensureFounderSandbox(mentor.actor);
      const second = await ensureFounderSandbox(mentor.actor);
      expect(second).toEqual(first);
    });

    it("creates a Workspace with kind='sandbox' and no assigned Mentor", async () => {
      const mentor = await createMentor("ensure-kind");
      const { workspaceId } = await ensureFounderSandbox(mentor.actor);
      const row = await fetchWorkspaceRow(workspaceId);
      expect(row).toEqual({ kind: "sandbox", mentor_user_id: null });
    });

    it("forbids a Founder actor from requesting a sandbox", async () => {
      const founder = await createFounderWithVenture("ensure-forbidden");
      await expect(ensureFounderSandbox(founder.actor)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });
  });

  describe("createFounderSandbox", () => {
    it("demotes the old current sandbox rather than deleting it, and only the new one resolves", async () => {
      const mentor = await createMentor("new-sandbox-demote");
      const first = await ensureFounderSandbox(mentor.actor);

      const second = await createFounderSandbox(mentor.actor);
      expect(second.workspaceId).not.toBe(first.workspaceId);

      const state = await resolveFounderPreviewState(mentor.userId);
      expect(state.sandboxWorkspaceId).toBe(second.workspaceId);

      const resolved = await resolveFounderWorkspace(
        previewingActor(mentor.userId),
      );
      expect(resolved.id).toBe(second.workspaceId);

      // The old row still exists — never hard-deleted — just no longer current.
      const oldRow = await pool.query<{
        kind: string;
        is_current_sandbox: boolean;
      }>(`select kind, is_current_sandbox from workspaces where id = $1`, [
        first.workspaceId,
      ]);
      expect(oldRow.rows[0]).toEqual({
        kind: "sandbox",
        is_current_sandbox: false,
      });
    });

    it("forbids a Founder actor from starting a new sandbox", async () => {
      const founder = await createFounderWithVenture("new-sandbox-forbidden");
      await expect(createFounderSandbox(founder.actor)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });
  });

  describe("enterFounderPreview / exitFounderPreview", () => {
    it("forbids a Founder actor from entering or exiting preview", async () => {
      const founder = await createFounderWithVenture("enter-forbidden");
      await expect(enterFounderPreview(founder.actor)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(exitFounderPreview(founder.actor)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });
  });

  describe("isolation: a previewing Mentor is confined to their own sandbox", () => {
    it("resolveFounderWorkspace resolves to the Mentor's own sandbox, never a real Founder's", async () => {
      const mentor = await createMentor("isolation-resolve");
      const otherFounder = await createFounderWithVenture(
        "isolation-resolve-other",
      );
      const sandbox = await enterFounderPreview(mentor.actor);

      const resolved = await resolveFounderWorkspace(
        previewingActor(mentor.userId),
      );
      expect(resolved.id).toBe(sandbox.workspaceId);
      expect(resolved.id).not.toBe(otherFounder.workspaceId);
    });

    it("getOrCreateProgramRun succeeds against the Mentor's own sandbox Venture", async () => {
      const mentor = await createMentor("isolation-own-run");
      const sandbox = await enterFounderPreview(mentor.actor);

      const result = await getOrCreateProgramRun(
        previewingActor(mentor.userId),
        { ventureId: sandbox.ventureId },
        { programKey: PROGRAM_KEY },
      );
      expect(result.created).toBe(true);
      expect(result.run.ventureId).toBe(sandbox.ventureId);
    });

    it("getOrCreateProgramRun returns NOT_FOUND when a previewing Mentor targets a real Founder's ventureId", async () => {
      const mentor = await createMentor("isolation-cross-run");
      const otherFounder = await createFounderWithVenture(
        "isolation-cross-run-other",
      );
      await enterFounderPreview(mentor.actor);

      await expect(
        getOrCreateProgramRun(
          previewingActor(mentor.userId),
          { ventureId: otherFounder.ventureId },
          { programKey: PROGRAM_KEY },
        ),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("forbids a previewing Mentor from calling listMentorFounders — cannot act as Mentor while previewing", async () => {
      const mentor = await createMentor("isolation-no-mentor-acts");
      await enterFounderPreview(mentor.actor);

      await expect(
        listMentorFounders(previewingActor(mentor.userId)),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("isolation: a sandbox never leaks into ordinary Mentor surfaces", () => {
    it("listMentorFounders never includes a Mentor's own sandbox", async () => {
      const mentor = await createMentor("leak-list");
      const sandbox = await ensureFounderSandbox(mentor.actor);

      const founders = await listMentorFounders(mentor.actor);
      expect(founders.some((f) => f.workspaceId === sandbox.workspaceId)).toBe(
        false,
      );
    });

    it("assertMentorOwnsWorkspace rejects a sandbox workspaceId as not found", async () => {
      const mentor = await createMentor("leak-assert-owner");
      const otherMentor = await createMentor("leak-assert-viewer");
      const sandbox = await ensureFounderSandbox(mentor.actor);

      await expect(
        assertMentorOwnsWorkspace(otherMentor.actor, sandbox.workspaceId),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      // Even the sandbox's own owner can't reach it through the Mentor path.
      await expect(
        assertMentorOwnsWorkspace(mentor.actor, sandbox.workspaceId),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("restartFounderSandbox", () => {
    it("archives the current Run without deleting it, and lets a fresh Run be created after", async () => {
      const mentor = await createMentor("restart-lifecycle");
      const sandbox = await enterFounderPreview(mentor.actor);
      const firstRun = await getOrCreateProgramRun(
        previewingActor(mentor.userId),
        { ventureId: sandbox.ventureId },
        { programKey: PROGRAM_KEY },
      );

      await restartFounderSandbox(mentor.actor);

      const archivedRow = await pool.query<{ status: string }>(
        `select status from program_runs where id = $1`,
        [firstRun.run.id],
      );
      expect(archivedRow.rows[0].status).toBe("archived");

      const secondRun = await getOrCreateProgramRun(
        previewingActor(mentor.userId),
        { ventureId: sandbox.ventureId },
        { programKey: PROGRAM_KEY },
      );
      expect(secondRun.created).toBe(true);
      expect(secondRun.run.id).not.toBe(firstRun.run.id);
    });

    it("forbids a Founder actor from restarting", async () => {
      const founder = await createFounderWithVenture("restart-forbidden");
      await expect(restartFounderSandbox(founder.actor)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });
  });

  describe("assignWorkspaceMentor rejects a sandbox target", () => {
    it("returns VALIDATION_ERROR rather than the raw DB constraint violation", async () => {
      const sandboxOwner = await createMentor("assign-sandbox-owner");
      const otherMentor = await createMentor("assign-sandbox-target");
      const sandbox = await ensureFounderSandbox(sandboxOwner.actor);

      const adminActor: ActorContext = {
        userId: randomUUID(),
        role: "admin",
        source: "web",
      };

      await expect(
        assignWorkspaceMentor(adminActor, {
          workspaceId: sandbox.workspaceId,
          mentorUserId: otherMentor.userId,
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });
  });
});
