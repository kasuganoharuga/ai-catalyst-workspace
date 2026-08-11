import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";

import {
  assignWorkspaceMentor,
  getAdminDashboardStats,
  listAdminUsers,
  listAssignableMentors,
  softDeleteUser,
} from "./index.js";

describe("admin user management — database integration", () => {
  const emailPrefix = `admin-users-${randomUUID()}`;
  const createdUserIds: string[] = [];
  let admin: ActorContext;
  let secondAdmin: ActorContext;
  let mentor: ActorContext;
  let otherMentor: ActorContext;
  let founderUserId: string;
  let workspaceId: string;

  function testEmail(label: string): string {
    return `${emailPrefix}-${label}@example.com`;
  }

  async function insertUser(
    label: string,
    role: "admin" | "mentor" | "founder" | "pending",
  ): Promise<string> {
    const email = testEmail(label);
    const result = await pool.query<{ id: string }>(
      "insert into users (name, email, role) values ($1, $2, $3) returning id",
      [email, email, role],
    );
    createdUserIds.push(result.rows[0].id);
    return result.rows[0].id;
  }

  beforeAll(async () => {
    const adminId = await insertUser("admin", "admin");
    const secondAdminId = await insertUser("admin-2", "admin");
    const mentorId = await insertUser("mentor", "mentor");
    const otherMentorId = await insertUser("mentor-2", "mentor");
    founderUserId = await insertUser("founder", "founder");

    admin = { userId: adminId, role: "admin" };
    secondAdmin = { userId: secondAdminId, role: "admin" };
    mentor = { userId: mentorId, role: "mentor" };
    otherMentor = { userId: otherMentorId, role: "mentor" };

    const workspaceResult = await pool.query<{ id: string }>(
      `insert into workspaces (founder_user_id, name, slug)
       values ($1, $2, $3) returning id`,
      [founderUserId, "Admin test workspace", `admin-ws-${randomUUID()}`],
    );
    workspaceId = workspaceResult.rows[0].id;
  });

  afterAll(async () => {
    await pool.query(
      "delete from user_active_contexts where user_id = any($1::uuid[])",
      [createdUserIds],
    );
    await pool.query(
      "delete from workspaces where founder_user_id = any($1::uuid[])",
      [createdUserIds],
    );
    await pool.query(
      `update workspaces set mentor_user_id = null
       where mentor_user_id = any($1::uuid[])`,
      [createdUserIds],
    );
    await pool.query("delete from users where id = any($1::uuid[])", [
      createdUserIds,
    ]);
  });

  it("lists live users and assignable mentors for an admin", async () => {
    const users = await listAdminUsers(admin);
    expect(users.some((user) => user.id === founderUserId)).toBe(true);
    expect(users.some((user) => user.id === mentor.userId)).toBe(true);

    const mentors = await listAssignableMentors(admin);
    expect(mentors.map((row) => row.id)).toEqual(
      expect.arrayContaining([mentor.userId, otherMentor.userId]),
    );
  });

  it("returns dashboard stats for an admin", async () => {
    const stats = await getAdminDashboardStats(admin);
    expect(stats.liveUsers).toBeGreaterThanOrEqual(5);
    expect(stats.founders).toBeGreaterThanOrEqual(1);
    expect(stats.mentors).toBeGreaterThanOrEqual(2);
    expect(stats.admins).toBeGreaterThanOrEqual(2);
    // Founder workspace starts unbound in beforeAll.
    expect(stats.unassignedFounders).toBeGreaterThanOrEqual(1);
    expect(stats.assignedFounders).toBeGreaterThanOrEqual(0);
    expect(stats.pendingInvitations).toBeGreaterThanOrEqual(0);
    expect(stats.joinedThisWeek).toBeGreaterThanOrEqual(0);
    expect(stats.recentUsers.length).toBeGreaterThan(0);
    expect(stats.recentUsers.length).toBeLessThanOrEqual(5);
  });

  it("rejects non-admin actors", async () => {
    await expect(listAdminUsers(mentor)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(getAdminDashboardStats(mentor)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      assignWorkspaceMentor(mentor, {
        workspaceId,
        mentorUserId: mentor.userId,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("assigns and clears a workspace mentor", async () => {
    await assignWorkspaceMentor(admin, {
      workspaceId,
      mentorUserId: mentor.userId,
    });

    const assigned = await pool.query<{ mentor_user_id: string | null }>(
      "select mentor_user_id from workspaces where id = $1",
      [workspaceId],
    );
    expect(assigned.rows[0].mentor_user_id).toBe(mentor.userId);

    const listed = await listAdminUsers(admin);
    const founder = listed.find((user) => user.id === founderUserId);
    expect(founder?.workspaceId).toBe(workspaceId);
    expect(founder?.mentorUserId).toBe(mentor.userId);

    await assignWorkspaceMentor(admin, {
      workspaceId,
      mentorUserId: otherMentor.userId,
    });
    await assignWorkspaceMentor(admin, {
      workspaceId,
      mentorUserId: null,
    });

    const cleared = await pool.query<{ mentor_user_id: string | null }>(
      "select mentor_user_id from workspaces where id = $1",
      [workspaceId],
    );
    expect(cleared.rows[0].mentor_user_id).toBeNull();
  });

  it("soft-deletes a mentor and unbinds their workspaces", async () => {
    const disposableMentorId = await insertUser("mentor-del", "mentor");
    await assignWorkspaceMentor(admin, {
      workspaceId,
      mentorUserId: disposableMentorId,
    });

    await softDeleteUser(admin, disposableMentorId);

    const mentorRow = await pool.query<{ deleted_at: Date | null }>(
      "select deleted_at from users where id = $1",
      [disposableMentorId],
    );
    expect(mentorRow.rows[0].deleted_at).not.toBeNull();

    const workspaceRow = await pool.query<{ mentor_user_id: string | null }>(
      "select mentor_user_id from workspaces where id = $1",
      [workspaceId],
    );
    expect(workspaceRow.rows[0].mentor_user_id).toBeNull();
  });

  it("soft-deletes a founder and archives their workspace", async () => {
    const disposableFounderId = await insertUser("founder-del", "founder");
    const ws = await pool.query<{ id: string }>(
      `insert into workspaces (founder_user_id, name, slug)
       values ($1, $2, $3) returning id`,
      [disposableFounderId, "To archive", `admin-archive-${randomUUID()}`],
    );

    await softDeleteUser(admin, disposableFounderId);

    const workspaceRow = await pool.query<{
      status: string;
      archived_at: Date | null;
    }>("select status, archived_at from workspaces where id = $1", [
      ws.rows[0].id,
    ]);
    expect(workspaceRow.rows[0].status).toBe("archived");
    expect(workspaceRow.rows[0].archived_at).not.toBeNull();
  });

  it("refuses self-delete when another admin remains", async () => {
    await expect(softDeleteUser(admin, admin.userId)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "You cannot delete your own account.",
    });
  });

  it("refuses deleting the last live admin", async () => {
    // Isolate the check from leftover admins in the shared local DB
    // (e.g. admin@seed.test) by soft-deleting every other live admin for
    // the duration of this assertion, then restoring them.
    const others = await pool.query<{ id: string }>(
      `select id from users
       where role = 'admin'
         and deleted_at is null
         and id <> $1`,
      [admin.userId],
    );
    const otherIds = others.rows.map((row) => row.id);
    if (otherIds.length > 0) {
      await pool.query(
        `update users set deleted_at = now() where id = any($1::uuid[])`,
        [otherIds],
      );
    }

    try {
      await expect(softDeleteUser(admin, admin.userId)).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
        message: "Cannot delete the last admin account.",
      });
    } finally {
      if (otherIds.length > 0) {
        await pool.query(
          `update users set deleted_at = null where id = any($1::uuid[])`,
          [otherIds],
        );
      }
    }

    // secondAdmin is still live after restore — keep the fixture usable.
    expect(secondAdmin.userId).toBeTruthy();
  });
});
