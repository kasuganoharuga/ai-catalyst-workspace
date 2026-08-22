import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type { ToolkitSeedContent } from "@ai-catalyst/services/content-seed";
import { saveArtifactSubmission } from "@ai-catalyst/services/artifact";
import { startOrResumeAttempt } from "@ai-catalyst/services/attempt";
import { ServiceError } from "@ai-catalyst/services/errors";
import { seedFixtureProgram } from "@ai-catalyst/services/testing/db-fixtures";
import { getOrCreateProgramRun } from "@ai-catalyst/services/workflow";

import {
  createArtifactCommentThread,
  editArtifactComment,
  listArtifactCommentThreads,
  markArtifactCommentThreadRead,
  reopenArtifactCommentThread,
  replyToArtifactCommentThread,
  resolveArtifactCommentThread,
  softDeleteArtifactComment,
} from "./index.js";

/**
 * Integration tests against the real Postgres database — same fixture
 * pattern as mentor/index.db.test.ts and artifact/index.db.test.ts: a
 * fixture Program seeded through the real reconciler, a real Run, and a
 * real Artifact saved through saveArtifactSubmission, then commented on
 * through the service under test.
 */
describe("artifact-comment service — database integration", () => {
  const RUN_SUFFIX = randomBytes(4).toString("hex");
  const emailPrefix = `artifact-comment-test-${RUN_SUFFIX}`;
  const PROGRAM_KEY = `artifact-comment-service-${RUN_SUFFIX}`;
  const ARTIFACT_KEY = "verdict";
  const MODULE_KEY = "module-a";
  const HEADING = "Evidence";
  const HEADING_LEVEL = 2;
  const ARTIFACT_CONTENT = [
    "# Fixture Verdict",
    "",
    `## ${HEADING}`,
    "",
    "Body text under the heading.",
  ].join("\n");

  const createdUserIds: string[] = [];

  function fixtureContent(): ToolkitSeedContent {
    return {
      program: {
        programKey: PROGRAM_KEY,
        programName: `Artifact comment test program ${PROGRAM_KEY}`,
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
      ],
      prompts: [],
      promptBindings: [],
    };
  }

  async function createUser(
    label: string,
    role: "founder" | "mentor" | "pending",
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

  function pendingActor(userId: string): ActorContext {
    return { userId, role: "pending", source: "web" };
  }

  async function createFounderWithSavedArtefact(label: string) {
    const userId = await createUser(label, "founder");
    const actor: ActorContext = { userId, role: "founder", source: "web" };

    const workspaceResult = await pool.query<{ id: string }>(
      `insert into workspaces (founder_user_id, name, slug)
       values ($1, $2, $3) returning id`,
      [userId, `Fixture ${label}`, `artifact-comment-${label}-${randomUUID()}`],
    );
    const workspaceId = workspaceResult.rows[0].id;

    const ventureResult = await pool.query<{ id: string }>(
      `insert into ventures (workspace_id, created_by_user_id, name, slug)
       values ($1, $2, $3, $4) returning id`,
      [
        workspaceId,
        userId,
        `Fixture Venture ${label}`,
        `artifact-comment-venture-${label}-${randomUUID()}`,
      ],
    );
    const ventureId = ventureResult.rows[0].id;

    const run = await getOrCreateProgramRun(
      actor,
      { ventureId },
      { programKey: PROGRAM_KEY },
    );

    const moduleResult = await pool.query<{ id: string }>(
      `select id from program_run_modules
       where program_run_branch_id = $1 and module_key = $2`,
      [run.run.activeBranchId, MODULE_KEY],
    );

    const attempt = await startOrResumeAttempt(actor, {
      programRunModuleId: moduleResult.rows[0].id,
    });
    await saveArtifactSubmission(actor, {
      attemptId: attempt.attempt.id,
      artifactKey: ARTIFACT_KEY,
      content: ARTIFACT_CONTENT,
    });

    return { actor, workspaceId, ventureId, attemptId: attempt.attempt.id };
  }

  beforeAll(async () => {
    await seedFixtureProgram(fixtureContent());
  });

  afterAll(async () => {
    await pool.query(
      "delete from artifact_comments where workspace_id in (select id from workspaces where founder_user_id = any($1::uuid[]))",
      [createdUserIds],
    );
    await pool.query(
      "delete from artifact_comment_reads where thread_id in (select id from artifact_comment_threads where workspace_id in (select id from workspaces where founder_user_id = any($1::uuid[])))",
      [createdUserIds],
    );
    await pool.query(
      "delete from artifact_comment_threads where workspace_id in (select id from workspaces where founder_user_id = any($1::uuid[]))",
      [createdUserIds],
    );
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

  describe("createArtifactCommentThread", () => {
    it("opens a section-anchored thread and writes its first comment", async () => {
      const founder = await createFounderWithSavedArtefact("create-founder");
      const mentorId = await createUser("create-mentor", "mentor");

      const thread = await createArtifactCommentThread(mentorActor(mentorId), {
        attemptId: founder.attemptId,
        artifactKey: ARTIFACT_KEY,
        anchor: {
          kind: "section",
          heading: HEADING,
          headingLevel: HEADING_LEVEL,
          quote: "Body text under the heading.",
        },
        body: "Can you add a citation here?",
      });

      expect(thread.anchor).toEqual({
        kind: "section",
        heading: HEADING,
        headingLevel: HEADING_LEVEL,
        quote: "Body text under the heading.",
      });
      expect(thread.status).toBe("open");
      expect(thread.comments).toHaveLength(1);
      expect(thread.comments[0].authorRole).toBe("mentor");
      expect(thread.comments[0].body).toBe("Can you add a citation here?");
      expect(thread.unreadCount).toBe(0);
    });

    it("opens a document-anchored thread when no heading is given", async () => {
      const founder =
        await createFounderWithSavedArtefact("create-doc-founder");
      const mentorId = await createUser("create-doc-mentor", "mentor");

      const thread = await createArtifactCommentThread(mentorActor(mentorId), {
        attemptId: founder.attemptId,
        artifactKey: ARTIFACT_KEY,
        anchor: { kind: "document" },
        body: "Overall this looks solid.",
      });

      expect(thread.anchor).toEqual({
        kind: "document",
        heading: null,
        headingLevel: null,
        quote: null,
      });
    });

    it("rejects a section anchor whose heading does not exist in the current Artifact", async () => {
      const founder =
        await createFounderWithSavedArtefact("bad-anchor-founder");
      const mentorId = await createUser("bad-anchor-mentor", "mentor");

      await expect(
        createArtifactCommentThread(mentorActor(mentorId), {
          attemptId: founder.attemptId,
          artifactKey: ARTIFACT_KEY,
          anchor: {
            kind: "section",
            heading: "Nonexistent Heading",
            headingLevel: 2,
          },
          body: "This heading isn't real.",
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("rejects a document anchor that also carries a heading", async () => {
      const founder = await createFounderWithSavedArtefact(
        "bad-doc-anchor-founder",
      );
      const mentorId = await createUser("bad-doc-anchor-mentor", "mentor");

      await expect(
        createArtifactCommentThread(mentorActor(mentorId), {
          attemptId: founder.attemptId,
          artifactKey: ARTIFACT_KEY,
          anchor: { kind: "document", heading: HEADING, headingLevel: 2 },
          body: "This should fail.",
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("rejects an empty comment body", async () => {
      const founder =
        await createFounderWithSavedArtefact("empty-body-founder");
      const mentorId = await createUser("empty-body-mentor", "mentor");

      await expect(
        createArtifactCommentThread(mentorActor(mentorId), {
          attemptId: founder.attemptId,
          artifactKey: ARTIFACT_KEY,
          anchor: { kind: "document" },
          body: "   ",
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("rejects a pending actor", async () => {
      const founder = await createFounderWithSavedArtefact("pending-founder");
      const pendingUserId = await createUser("pending-user", "pending");

      await expect(
        createArtifactCommentThread(pendingActor(pendingUserId), {
          attemptId: founder.attemptId,
          artifactKey: ARTIFACT_KEY,
          anchor: { kind: "document" },
          body: "I should not be allowed to do this.",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("forbids the Founder from opening a new thread on their own artefact — only a Mentor or Admin starts the feedback loop", async () => {
      const founder = await createFounderWithSavedArtefact(
        "create-forbidden-founder",
      );

      await expect(
        createArtifactCommentThread(founder.actor, {
          attemptId: founder.attemptId,
          artifactKey: ARTIFACT_KEY,
          anchor: { kind: "document" },
          body: "I should not be allowed to open this.",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("hides a nonexistent attempt as not found, rather than forbidden", async () => {
      const mentorId = await createUser("cross-mentor", "mentor");

      await expect(
        createArtifactCommentThread(mentorActor(mentorId), {
          attemptId: randomUUID(),
          artifactKey: ARTIFACT_KEY,
          anchor: { kind: "document" },
          body: "This attempt does not exist.",
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("listArtifactCommentThreads", () => {
    it("orders threads oldest first, each with its comments and an accurate unread count", async () => {
      const founder = await createFounderWithSavedArtefact("list-founder");
      const mentorId = await createUser("list-mentor", "mentor");

      const thread = await createArtifactCommentThread(mentorActor(mentorId), {
        attemptId: founder.attemptId,
        artifactKey: ARTIFACT_KEY,
        anchor: { kind: "document" },
        body: "Opening comment from the mentor.",
      });
      await replyToArtifactCommentThread(founder.actor, {
        threadId: thread.id,
        body: "Founder's reply.",
      });

      const foundersView = await listArtifactCommentThreads(founder.actor, {
        attemptId: founder.attemptId,
        artifactKey: ARTIFACT_KEY,
      });
      expect(foundersView).toHaveLength(1);
      expect(foundersView[0].comments.map((c) => c.body)).toEqual([
        "Opening comment from the mentor.",
        "Founder's reply.",
      ]);
      // The founder just wrote the reply themselves, so nothing is unread
      // for them; the mentor's own opening comment predates any read marker
      // the founder set, but was authored by someone else — the founder's
      // own reply-write path marks the thread read as of "now", after which
      // the mentor's earlier comment is no longer unread either.
      expect(foundersView[0].unreadCount).toBe(0);

      const mentorsView = await listArtifactCommentThreads(
        mentorActor(mentorId),
        { attemptId: founder.attemptId, artifactKey: ARTIFACT_KEY },
      );
      // The mentor has not read since opening the thread — the founder's
      // reply is unread for them.
      expect(mentorsView[0].unreadCount).toBe(1);
    });

    it("returns an empty array when the artifact has no threads yet", async () => {
      const founder =
        await createFounderWithSavedArtefact("no-threads-founder");

      const threads = await listArtifactCommentThreads(founder.actor, {
        attemptId: founder.attemptId,
        artifactKey: ARTIFACT_KEY,
      });
      expect(threads).toEqual([]);
    });

    it("hides a resolved thread from the Founder but keeps it visible to the Mentor", async () => {
      const founder = await createFounderWithSavedArtefact(
        "list-resolved-founder",
      );
      const mentorId = await createUser("list-resolved-mentor", "mentor");
      const mentor = mentorActor(mentorId);

      const openThread = await createArtifactCommentThread(mentor, {
        attemptId: founder.attemptId,
        artifactKey: ARTIFACT_KEY,
        anchor: { kind: "document" },
        body: "Still open.",
      });
      const resolvedThread = await createArtifactCommentThread(mentor, {
        attemptId: founder.attemptId,
        artifactKey: ARTIFACT_KEY,
        anchor: {
          kind: "section",
          heading: HEADING,
          headingLevel: HEADING_LEVEL,
        },
        body: "Already addressed.",
      });
      await resolveArtifactCommentThread(mentor, {
        threadId: resolvedThread.id,
      });

      const foundersView = await listArtifactCommentThreads(founder.actor, {
        attemptId: founder.attemptId,
        artifactKey: ARTIFACT_KEY,
      });
      expect(foundersView.map((t) => t.id)).toEqual([openThread.id]);

      const mentorsView = await listArtifactCommentThreads(mentor, {
        attemptId: founder.attemptId,
        artifactKey: ARTIFACT_KEY,
      });
      expect(mentorsView.map((t) => t.id).sort()).toEqual(
        [openThread.id, resolvedThread.id].sort(),
      );
    });
  });

  describe("markArtifactCommentThreadRead", () => {
    it("clears the unread count for the reader without affecting other viewers", async () => {
      const founder = await createFounderWithSavedArtefact("read-founder");
      const mentorId = await createUser("read-mentor", "mentor");

      const mentor = mentorActor(mentorId);

      const thread = await createArtifactCommentThread(mentor, {
        attemptId: founder.attemptId,
        artifactKey: ARTIFACT_KEY,
        anchor: { kind: "document" },
        body: "Mentor opens a thread.",
      });

      // The mentor just wrote the opening comment themselves, so it's
      // already read for them — reply as the founder first so there's
      // something unread for the mentor to mark read below.
      await replyToArtifactCommentThread(founder.actor, {
        threadId: thread.id,
        body: "Founder's reply.",
      });

      const beforeRead = await listArtifactCommentThreads(mentor, {
        attemptId: founder.attemptId,
        artifactKey: ARTIFACT_KEY,
      });
      expect(beforeRead[0].unreadCount).toBe(1);

      await markArtifactCommentThreadRead(mentor, { threadId: thread.id });

      const afterRead = await listArtifactCommentThreads(mentor, {
        attemptId: founder.attemptId,
        artifactKey: ARTIFACT_KEY,
      });
      expect(afterRead[0].unreadCount).toBe(0);

      const foundersView = await listArtifactCommentThreads(founder.actor, {
        attemptId: founder.attemptId,
        artifactKey: ARTIFACT_KEY,
      });
      expect(foundersView[0].unreadCount).toBe(0);
    });
  });

  describe("resolveArtifactCommentThread / reopenArtifactCommentThread", () => {
    it("resolves then reopens, keeping resolved_by/resolved_at consistent with status", async () => {
      const founder = await createFounderWithSavedArtefact("resolve-founder");
      const mentorId = await createUser("resolve-mentor", "mentor");
      const mentor = mentorActor(mentorId);

      const thread = await createArtifactCommentThread(mentor, {
        attemptId: founder.attemptId,
        artifactKey: ARTIFACT_KEY,
        anchor: { kind: "document" },
        body: "Please address this.",
      });

      await resolveArtifactCommentThread(mentor, { threadId: thread.id });
      // The Mentor's own view, not the Founder's — a resolved thread drops
      // off the Founder's list entirely (see listArtifactCommentThreads).
      const [resolved] = await listArtifactCommentThreads(mentor, {
        attemptId: founder.attemptId,
        artifactKey: ARTIFACT_KEY,
      });
      expect(resolved.status).toBe("resolved");
      expect(resolved.resolvedByUserId).toBe(mentorId);
      expect(resolved.resolvedAt).not.toBeNull();
      expect(
        await listArtifactCommentThreads(founder.actor, {
          attemptId: founder.attemptId,
          artifactKey: ARTIFACT_KEY,
        }),
      ).toEqual([]);

      await reopenArtifactCommentThread(mentor, { threadId: thread.id });
      const [reopened] = await listArtifactCommentThreads(founder.actor, {
        attemptId: founder.attemptId,
        artifactKey: ARTIFACT_KEY,
      });
      expect(reopened.status).toBe("open");
      expect(reopened.resolvedByUserId).toBeNull();
      expect(reopened.resolvedAt).toBeNull();
    });

    it("forbids the Founder from resolving or reopening a thread — only the Mentor giving feedback (or an Admin) closes it out", async () => {
      const founder = await createFounderWithSavedArtefact(
        "resolve-forbidden-founder",
      );
      const mentorId = await createUser("resolve-forbidden-mentor", "mentor");
      const mentor = mentorActor(mentorId);

      const thread = await createArtifactCommentThread(mentor, {
        attemptId: founder.attemptId,
        artifactKey: ARTIFACT_KEY,
        anchor: { kind: "document" },
        body: "Please address this.",
      });

      await expect(
        resolveArtifactCommentThread(founder.actor, { threadId: thread.id }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      await resolveArtifactCommentThread(mentor, { threadId: thread.id });

      await expect(
        reopenArtifactCommentThread(founder.actor, { threadId: thread.id }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("editArtifactComment / softDeleteArtifactComment", () => {
    it("lets the author edit their own comment", async () => {
      const founder = await createFounderWithSavedArtefact("edit-founder");
      const mentorId = await createUser("edit-mentor", "mentor");
      const mentor = mentorActor(mentorId);

      const thread = await createArtifactCommentThread(mentor, {
        attemptId: founder.attemptId,
        artifactKey: ARTIFACT_KEY,
        anchor: { kind: "document" },
        body: "Original text.",
      });

      const edited = await editArtifactComment(mentor, {
        commentId: thread.comments[0].id,
        body: "Corrected text.",
      });
      expect(edited.body).toBe("Corrected text.");
      expect(edited.editedAt).not.toBeNull();
    });

    it("forbids a different actor from editing someone else's comment", async () => {
      const founder = await createFounderWithSavedArtefact(
        "edit-forbidden-founder",
      );
      const mentorId = await createUser("edit-forbidden-mentor", "mentor");

      const thread = await createArtifactCommentThread(mentorActor(mentorId), {
        attemptId: founder.attemptId,
        artifactKey: ARTIFACT_KEY,
        anchor: { kind: "document" },
        body: "Mentor's own comment.",
      });

      await expect(
        editArtifactComment(founder.actor, {
          commentId: thread.comments[0].id,
          body: "Founder trying to rewrite it.",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("forbids a different actor from deleting someone else's comment", async () => {
      const founder = await createFounderWithSavedArtefact(
        "delete-forbidden-founder",
      );
      const mentorId = await createUser("delete-forbidden-mentor", "mentor");

      const thread = await createArtifactCommentThread(mentorActor(mentorId), {
        attemptId: founder.attemptId,
        artifactKey: ARTIFACT_KEY,
        anchor: { kind: "document" },
        body: "Mentor's own comment.",
      });

      await expect(
        softDeleteArtifactComment(founder.actor, {
          commentId: thread.comments[0].id,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("refuses to delete a thread's opening comment", async () => {
      const founder = await createFounderWithSavedArtefact(
        "delete-opening-founder",
      );
      const mentorId = await createUser("delete-opening-mentor", "mentor");
      const mentor = mentorActor(mentorId);

      const thread = await createArtifactCommentThread(mentor, {
        attemptId: founder.attemptId,
        artifactKey: ARTIFACT_KEY,
        anchor: { kind: "document" },
        body: "The opening message.",
      });

      await expect(
        softDeleteArtifactComment(mentor, {
          commentId: thread.comments[0].id,
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("lets the author delete their own reply, which then disappears from the list", async () => {
      const founder = await createFounderWithSavedArtefact(
        "delete-reply-founder",
      );
      const mentorId = await createUser("delete-reply-mentor", "mentor");

      const thread = await createArtifactCommentThread(mentorActor(mentorId), {
        attemptId: founder.attemptId,
        artifactKey: ARTIFACT_KEY,
        anchor: { kind: "document" },
        body: "Opening message.",
      });
      const reply = await replyToArtifactCommentThread(founder.actor, {
        threadId: thread.id,
        body: "A reply I will delete.",
      });

      await softDeleteArtifactComment(founder.actor, { commentId: reply.id });

      const [afterDelete] = await listArtifactCommentThreads(founder.actor, {
        attemptId: founder.attemptId,
        artifactKey: ARTIFACT_KEY,
      });
      expect(afterDelete.comments.map((c) => c.body)).toEqual([
        "Opening message.",
      ]);
    });
  });

  describe("replyToArtifactCommentThread", () => {
    it("hides a thread outside the actor's scope as not found", async () => {
      const founderA = await createFounderWithSavedArtefact("reply-cross-a");
      const founderB = await createFounderWithSavedArtefact("reply-cross-b");
      const mentorId = await createUser("reply-cross-mentor", "mentor");

      const thread = await createArtifactCommentThread(mentorActor(mentorId), {
        attemptId: founderA.attemptId,
        artifactKey: ARTIFACT_KEY,
        anchor: { kind: "document" },
        body: "A thread on Founder A's artefact.",
      });

      await expect(
        replyToArtifactCommentThread(founderB.actor, {
          threadId: thread.id,
          body: "Founder B should not see this thread.",
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });
});
