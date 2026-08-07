import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { createFixtureFounderAccount } from "@ai-catalyst/services/testing/db-fixtures";

import {
  archiveVenture,
  createVenture,
  getVenture,
  listVentures,
  updateVentureClaudeProjectId,
} from "./index.js";

/**
 * Integration tests against the real Postgres database, following the same
 * pattern as packages/services/src/invitation/index.db.test.ts.
 */
describe("venture service — database integration", () => {
  const emailPrefix = `venture-test-${randomUUID()}`;
  const createdUserIds: string[] = [];
  let admin: ActorContext;

  async function createFounderWithWorkspace(
    label: string,
  ): Promise<{ actor: ActorContext; workspaceId: string }> {
    const { userId, workspaceId } = await createFixtureFounderAccount({
      label,
      emailPrefix,
      slugPrefix: "venture-service",
    });
    createdUserIds.push(userId);

    return { actor: { userId, role: "founder" }, workspaceId };
  }

  beforeAll(async () => {
    const adminResult = await pool.query<{ id: string }>(
      "insert into users (name, email, role) values ($1, $2, 'admin') returning id",
      [`${emailPrefix}-admin`, `${emailPrefix}-admin@example.com`],
    );
    createdUserIds.push(adminResult.rows[0].id);
    admin = { userId: adminResult.rows[0].id, role: "admin" };
  });

  afterAll(async () => {
    await pool.query(
      "delete from user_active_contexts where user_id = any($1::uuid[])",
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
  });

  it("creates a Venture with a slugified name", async () => {
    const { actor, workspaceId } = await createFounderWithWorkspace("create");

    const venture = await createVenture(actor, { name: "My First Idea" });

    expect(venture.workspaceId).toBe(workspaceId);
    expect(venture.name).toBe("My First Idea");
    expect(venture.slug).toMatch(/^my-first-idea-[0-9a-f]{6}$/);
    expect(venture.status).toBe("active");
    expect(venture.lifecycleStage).toBe("idea");
    expect(venture.oneLiner).toBeNull();
    expect(venture.summary).toBeNull();
    expect(venture.claudeProjectId).toBeNull();
    expect(venture.archivedAt).toBeNull();
  });

  it("retries the slug deterministically on a real collision instead of relying on random luck", async () => {
    const { actor, workspaceId } =
      await createFounderWithWorkspace("slug-retry");

    // Pre-create a Venture with the exact slug the first two deterministic
    // suffixes below would produce, forcing two real ON CONFLICT collisions
    // before the third attempt succeeds.
    const collidingSlug = "collide-me-abcdef";
    await pool.query(
      `insert into ventures (workspace_id, created_by_user_id, name, slug)
       values ($1, $2, 'Collision Fixture', $3)`,
      [workspaceId, actor.userId, collidingSlug],
    );

    let callCount = 0;
    const suffixes = ["abcdef", "abcdef", "123456"];

    const venture = await createVenture(
      actor,
      { name: "Collide Me" },
      { createSlugSuffix: () => suffixes[callCount++] },
    );

    expect(callCount).toBe(3);
    expect(venture.slug).toBe("collide-me-123456");
  });

  it("rejects create from a non-Founder actor", async () => {
    await expect(
      createVenture(admin, { name: "Not Allowed" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects a name that is only whitespace", async () => {
    const { actor } = await createFounderWithWorkspace("blank-name");

    await expect(createVenture(actor, { name: "   " })).rejects.toMatchObject(
      { code: "VALIDATION_ERROR" },
    );
  });

  it("normalizes an empty-string oneLiner/summary to null", async () => {
    const { actor } = await createFounderWithWorkspace("empty-optional");

    const venture = await createVenture(actor, {
      name: "Empty Optional Fields",
      oneLiner: "   ",
      summary: "",
    });

    expect(venture.oneLiner).toBeNull();
    expect(venture.summary).toBeNull();
  });

  it("produces a non-empty slug for a non-ASCII name via the fallback base", async () => {
    const { actor } = await createFounderWithWorkspace("non-ascii");

    const venture = await createVenture(actor, { name: "创业点子" });

    expect(venture.slug).toMatch(/^venture-[0-9a-f]{6}$/);
  });

  it("rejects create when the Workspace is not active", async () => {
    const { actor, workspaceId } = await createFounderWithWorkspace(
      "suspended-create",
    );
    await pool.query(
      "update workspaces set status = 'suspended' where id = $1",
      [workspaceId],
    );

    await expect(
      createVenture(actor, { name: "Should Not Be Created" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lists only the Founder's own Ventures, newest first with a stable id tie-break", async () => {
    const { actor, workspaceId } = await createFounderWithWorkspace("list");
    const { actor: otherActor } =
      await createFounderWithWorkspace("list-other");

    const first = await createVenture(actor, { name: "List First" });
    const second = await createVenture(actor, { name: "List Second" });
    await createVenture(otherActor, { name: "Other Workspace Venture" });

    const ventures = await listVentures(actor);
    const ids = ventures.map((v) => v.id);

    expect(ids).toContain(first.id);
    expect(ids).toContain(second.id);
    expect(ventures.every((v) => v.workspaceId === workspaceId)).toBe(true);

    expect(ids.indexOf(second.id)).toBeLessThan(ids.indexOf(first.id));
  });

  it("rejects getVenture/archiveVenture for a Venture in another Workspace", async () => {
    const { actor } = await createFounderWithWorkspace("cross-workspace");
    const { actor: otherActor } = await createFounderWithWorkspace(
      "cross-workspace-other",
    );
    const foreignVenture = await createVenture(otherActor, {
      name: "Foreign Venture",
    });

    await expect(getVenture(actor, foreignVenture.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      archiveVenture(actor, foreignVenture.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects a malformed Venture id before it reaches Postgres", async () => {
    const { actor } = await createFounderWithWorkspace("malformed-id");

    await expect(getVenture(actor, "not-a-uuid")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(archiveVenture(actor, "not-a-uuid")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("stores and clears a Claude Chat Project UUID on a Venture", async () => {
    const { actor } = await createFounderWithWorkspace("claude-project-id");
    const venture = await createVenture(actor, { name: "Claude Link Target" });
    const projectId = "a1b2c3d4-e5f6-4789-a012-3456789abcde";

    const updated = await updateVentureClaudeProjectId(actor, venture.id, {
      claudeProjectId: projectId,
    });
    expect(updated.claudeProjectId).toBe(projectId.toLowerCase());

    const fetched = await getVenture(actor, venture.id);
    expect(fetched.claudeProjectId).toBe(projectId.toLowerCase());

    const cleared = await updateVentureClaudeProjectId(actor, venture.id, {
      claudeProjectId: "",
    });
    expect(cleared.claudeProjectId).toBeNull();
  });

  it("accepts a Claude-issued UUID v7 project id", async () => {
    const { actor } = await createFounderWithWorkspace("claude-project-v7");
    const venture = await createVenture(actor, { name: "UUID v7 Target" });
    // Real Claude project ids look like this (version nibble = 7).
    const projectId = "019f7e34-1bed-7132-8a68-e6e0d2d27d2c";

    const updated = await updateVentureClaudeProjectId(actor, venture.id, {
      claudeProjectId: projectId,
    });
    expect(updated.claudeProjectId).toBe(projectId);
  });

  it("rejects an invalid Claude project UUID", async () => {
    const { actor } = await createFounderWithWorkspace("invalid-claude-id");
    const venture = await createVenture(actor, { name: "Invalid UUID Target" });

    await expect(
      updateVentureClaudeProjectId(actor, venture.id, {
        claudeProjectId: "not-a-uuid",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects Claude project updates on an archived Venture", async () => {
    const { actor } = await createFounderWithWorkspace("archived-claude-id");
    const venture = await createVenture(actor, { name: "Archived Claude Target" });
    await archiveVenture(actor, venture.id);

    await expect(
      updateVentureClaudeProjectId(actor, venture.id, {
        claudeProjectId: "a1b2c3d4-e5f6-4789-a012-3456789abcde",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("archives a Venture idempotently, only writing archived_at once", async () => {
    const { actor } = await createFounderWithWorkspace("archive-idempotent");
    const venture = await createVenture(actor, { name: "To Archive" });

    const firstArchive = await archiveVenture(actor, venture.id);
    expect(firstArchive.status).toBe("archived");
    expect(firstArchive.archivedAt).not.toBeNull();

    const secondArchive = await archiveVenture(actor, venture.id);
    expect(secondArchive.status).toBe("archived");
    expect(secondArchive.archivedAt).toBe(firstArchive.archivedAt);
  });

  it("rejects archive when the Workspace is not active", async () => {
    const { actor, workspaceId } = await createFounderWithWorkspace(
      "suspended-archive",
    );
    const venture = await createVenture(actor, { name: "Suspend Target" });
    await pool.query(
      "update workspaces set status = 'suspended' where id = $1",
      [workspaceId],
    );

    await expect(archiveVenture(actor, venture.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("clears active_venture_id for every user pointed at the archived Venture, not just the acting Founder", async () => {
    const { actor, workspaceId } = await createFounderWithWorkspace(
      "archive-clears-context",
    );
    const venture = await createVenture(actor, { name: "Shared Selection" });

    // The acting Founder's own selection.
    await pool.query(
      `insert into user_active_contexts (user_id, active_workspace_id, active_venture_id)
       values ($1, $2, $3)`,
      [actor.userId, workspaceId, venture.id],
    );

    // A second synthetic row simulating a future Mentor (or any other user)
    // whose selection happens to point at the same Venture — no real Mentor
    // invitation flow exists yet, so this is seeded directly.
    const otherUserResult = await pool.query<{ id: string }>(
      "insert into users (name, email, role) values ($1, $2, 'mentor') returning id",
      [
        `${emailPrefix}-archive-clears-context-mentor`,
        `${emailPrefix}-archive-clears-context-mentor@example.com`,
      ],
    );
    createdUserIds.push(otherUserResult.rows[0].id);
    await pool.query(
      `insert into user_active_contexts (user_id, active_workspace_id, active_venture_id)
       values ($1, $2, $3)`,
      [otherUserResult.rows[0].id, workspaceId, venture.id],
    );

    await archiveVenture(actor, venture.id);

    const { rows } = await pool.query<{ active_venture_id: string | null }>(
      "select active_venture_id from user_active_contexts where user_id = any($1::uuid[])",
      [[actor.userId, otherUserResult.rows[0].id]],
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.active_venture_id === null)).toBe(true);
  });
});
