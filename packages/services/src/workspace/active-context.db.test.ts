import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { createFixtureFounderAccount } from "@ai-catalyst/services/testing/db-fixtures";

import { getActiveContext, setActiveVenture } from "./active-context.js";

/**
 * Integration tests against the real Postgres database, following the same
 * pattern as packages/services/src/invitation/index.db.test.ts.
 */
describe("active-context service — database integration", () => {
  const emailPrefix = `active-context-test-${randomUUID()}`;
  const createdUserIds: string[] = [];
  let admin: ActorContext;

  async function createFounderWithWorkspace(
    label: string,
  ): Promise<{ actor: ActorContext; workspaceId: string }> {
    const { userId, workspaceId } = await createFixtureFounderAccount({
      label,
      emailPrefix,
      slugPrefix: "active-context",
    });
    createdUserIds.push(userId);

    return { actor: { userId, role: "founder" }, workspaceId };
  }

  async function createVenture(
    workspaceId: string,
    createdByUserId: string,
    label: string,
    status: "active" | "archived" = "active",
  ): Promise<string> {
    const archivedAt = status === "archived" ? new Date() : null;
    const result = await pool.query<{ id: string }>(
      `insert into ventures (workspace_id, created_by_user_id, name, slug, status, archived_at)
       values ($1, $2, $3, $4, $5, $6)
       returning id`,
      [
        workspaceId,
        createdByUserId,
        `Venture ${label}`,
        `venture-${label}-${randomUUID()}`,
        status,
        archivedAt,
      ],
    );
    return result.rows[0].id;
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

  it("creates the row on first read and returns no active Venture", async () => {
    const { actor, workspaceId } =
      await createFounderWithWorkspace("fresh-read");

    const context = await getActiveContext(actor);
    expect(context).toEqual({ workspaceId, ventureId: null });
  });

  it("self-heals a stale active_workspace_id and clears the incompatible Venture", async () => {
    const { actor, workspaceId } =
      await createFounderWithWorkspace("self-heal");
    const { workspaceId: otherWorkspaceId } = await createFounderWithWorkspace(
      "self-heal-other",
    );
    const staleVentureId = await createVenture(
      otherWorkspaceId,
      actor.userId,
      "self-heal-stale",
    );

    // Simulate corrupted/stale state directly — e.g. seeded test data or a
    // future bug — rather than going through the Service.
    await pool.query(
      `insert into user_active_contexts (user_id, active_workspace_id, active_venture_id)
       values ($1, $2, $3)`,
      [actor.userId, otherWorkspaceId, staleVentureId],
    );

    const context = await getActiveContext(actor);
    expect(context).toEqual({ workspaceId, ventureId: null });
  });

  it("does not write on a repeated read when nothing is wrong", async () => {
    const { actor } = await createFounderWithWorkspace("no-op-read");

    await getActiveContext(actor);
    const { rows: firstRows } = await pool.query<{ updated_at: Date }>(
      "select updated_at from user_active_contexts where user_id = $1",
      [actor.userId],
    );

    await getActiveContext(actor);
    const { rows: secondRows } = await pool.query<{ updated_at: Date }>(
      "select updated_at from user_active_contexts where user_id = $1",
      [actor.userId],
    );

    expect(secondRows[0].updated_at.getTime()).toBe(
      firstRows[0].updated_at.getTime(),
    );
  });

  it("switches the active Venture and clears it explicitly with null", async () => {
    const { actor, workspaceId } = await createFounderWithWorkspace("switch");
    const ventureId = await createVenture(workspaceId, actor.userId, "switch");

    const switched = await setActiveVenture(actor, ventureId);
    expect(switched).toEqual({ workspaceId, ventureId });

    const cleared = await setActiveVenture(actor, null);
    expect(cleared).toEqual({ workspaceId, ventureId: null });
  });

  it("rejects a Venture belonging to another Workspace", async () => {
    const { actor } = await createFounderWithWorkspace("cross-workspace");
    const { workspaceId: otherWorkspaceId, actor: otherActor } =
      await createFounderWithWorkspace("cross-workspace-other");
    const foreignVentureId = await createVenture(
      otherWorkspaceId,
      otherActor.userId,
      "cross-workspace-foreign",
    );

    await expect(
      setActiveVenture(actor, foreignVentureId),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("allows selecting an archived Venture for read-only history browsing", async () => {
    const { actor, workspaceId } =
      await createFounderWithWorkspace("archived-select");
    const archivedVentureId = await createVenture(
      workspaceId,
      actor.userId,
      "archived-select",
      "archived",
    );

    const context = await setActiveVenture(actor, archivedVentureId);
    expect(context).toEqual({ workspaceId, ventureId: archivedVentureId });
  });

  it("rejects a non-Founder actor", async () => {
    await expect(getActiveContext(admin)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(setActiveVenture(admin, null)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects a malformed Venture id before it reaches Postgres", async () => {
    const { actor } = await createFounderWithWorkspace("malformed-id");
    await expect(
      setActiveVenture(actor, "not-a-uuid"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
