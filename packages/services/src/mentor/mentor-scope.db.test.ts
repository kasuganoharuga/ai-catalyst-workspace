import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// MENTOR_SEES_ALL_FOUNDERS is currently true in production (see
// packages/services/src/internal/mentor-scope.ts). This suite forces the
// flag back to false via a module mock — hoisted above the imports below by
// vitest's compiler, same as vi.mock always is — so the scoped-mode code
// path in mentor/index.ts and storage/index.ts stays covered even though
// nothing runs it today. If this suite ever goes red, flipping the flag
// back to false is not safe until it's fixed.
vi.mock("@ai-catalyst/services/internal/mentor-scope", () => ({
  MENTOR_SEES_ALL_FOUNDERS: false,
}));

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";

import {
  getMentorArtefactDocument,
  getMentorFounderDetail,
  listMentorFounders,
} from "./index.js";

describe("mentor service — scoped mode (MENTOR_SEES_ALL_FOUNDERS = false)", () => {
  const RUN_SUFFIX = randomBytes(4).toString("hex");
  const emailPrefix = `mentor-scope-test-${RUN_SUFFIX}`;
  const createdUserIds: string[] = [];

  function mentorActor(userId: string): ActorContext {
    return { userId, role: "mentor", source: "web" };
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

  async function createFounder(
    label: string,
    mentorUserId: string | null,
  ): Promise<{ workspaceId: string }> {
    const userId = await createUser(label, "founder");
    const workspaceResult = await pool.query<{ id: string }>(
      `insert into workspaces (founder_user_id, name, slug, mentor_user_id)
       values ($1, $2, $3, $4) returning id`,
      [
        userId,
        `Fixture ${label}`,
        `mentor-scope-${label}-${randomUUID()}`,
        mentorUserId,
      ],
    );
    return { workspaceId: workspaceResult.rows[0].id };
  }

  afterAll(async () => {
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
  });

  it("listMentorFounders only lists founders assigned to this mentor", async () => {
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
    expect(
      rows.find((r) => r.workspaceId === mine.workspaceId)?.isAssignedToMe,
    ).toBe(true);
  });

  it("getMentorFounderDetail hides another mentor's founder as not found", async () => {
    const mentorA = await createUser("detail-a", "mentor");
    const mentorB = await createUser("detail-b", "mentor");
    const founder = await createFounder("detail-cross", mentorA);

    await expect(
      getMentorFounderDetail(mentorActor(mentorB), founder.workspaceId),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("getMentorArtefactDocument hides another mentor's founder as not found", async () => {
    const mentorA = await createUser("doc-a", "mentor");
    const mentorB = await createUser("doc-b", "mentor");
    const founder = await createFounder("doc-cross", mentorA);

    await expect(
      getMentorArtefactDocument(
        mentorActor(mentorB),
        founder.workspaceId,
        "module-a",
        "verdict",
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
