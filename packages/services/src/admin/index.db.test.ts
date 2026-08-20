import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";

import {
  assignWorkspaceMentor,
  getAdminDashboardStats,
  listAdminUsers,
  listAssignableMentors,
  resetUserPassword,
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

describe("admin password reset — database integration", () => {
  const emailPrefix = `admin-reset-${randomUUID()}`;
  const createdUserIds: string[] = [];
  const clientId = `admin-reset-client-${randomUUID()}`;
  let admin: ActorContext;
  let founder: ActorContext;
  let mentor: ActorContext;
  let founderEmail: string;
  let socialOnlyUserId: string;

  /** Records what the service asked the caller to persist, without hashing. */
  const writes: { userId: string; password: string }[] = [];
  async function recordWrite(userId: string, password: string): Promise<void> {
    writes.push({ userId, password });
  }

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

  /** The row Better Auth writes for email + password sign-in. */
  async function insertCredentialAccount(userId: string): Promise<void> {
    await pool.query(
      `insert into accounts (user_id, account_id, provider_id, password)
       values ($1, $2, 'credential', $3)`,
      [userId, userId, "hash-of-the-old-password"],
    );
  }

  async function insertSession(userId: string): Promise<void> {
    await pool.query(
      `insert into sessions (user_id, token, expires_at)
       values ($1, $2, now() + interval '7 days')`,
      [userId, `admin-reset-session-${randomUUID()}`],
    );
  }

  async function countSessions(userId: string): Promise<number> {
    const result = await pool.query<{ count: string }>(
      "select count(*)::text as count from sessions where user_id = $1",
      [userId],
    );
    return Number(result.rows[0].count);
  }

  async function countMcpAccessTokens(userId: string): Promise<number> {
    const result = await pool.query<{ count: string }>(
      `select count(*)::text as count
       from mcp_oauth_access_tokens
       where user_id = $1`,
      [userId],
    );
    return Number(result.rows[0].count);
  }

  async function insertMcpAccessToken(userId: string): Promise<void> {
    await pool.query(
      `insert into mcp_oauth_access_tokens
         (access_token, refresh_token, access_token_expires_at,
          refresh_token_expires_at, client_id, user_id, scopes)
       values ($1, $2, now() + interval '1 hour',
               now() + interval '30 days', $3, $4, 'mcp:connect')`,
      [
        `admin-reset-access-${randomUUID()}`,
        `admin-reset-refresh-${randomUUID()}`,
        clientId,
        userId,
      ],
    );
  }

  beforeAll(async () => {
    const adminId = await insertUser("admin", "admin");
    const mentorId = await insertUser("mentor", "mentor");
    const founderId = await insertUser("founder", "founder");
    socialOnlyUserId = await insertUser("social-only", "founder");

    admin = { userId: adminId, role: "admin" };
    mentor = { userId: mentorId, role: "mentor" };
    founder = { userId: founderId, role: "founder" };
    founderEmail = testEmail("founder");

    await insertCredentialAccount(adminId);
    await insertCredentialAccount(founderId);
    // socialOnlyUserId deliberately gets no credential account.

    await pool.query(
      `insert into mcp_oauth_applications
         (name, client_id, redirect_urls, type)
       values ($1, $2, $3, 'public')`,
      ["Admin reset test client", clientId, "https://example.com/callback"],
    );
  });

  afterEach(() => {
    writes.length = 0;
  });

  afterAll(async () => {
    // accounts / sessions / mcp_oauth_* all cascade from users.
    await pool.query("delete from users where id = any($1::uuid[])", [
      createdUserIds,
    ]);
    await pool.query(
      "delete from mcp_oauth_applications where client_id = $1",
      [clientId],
    );
  });

  it("issues a temporary password and revokes what the old one reached", async () => {
    await insertSession(founder.userId);
    await insertMcpAccessToken(founder.userId);
    expect(await countSessions(founder.userId)).toBe(1);
    expect(await countMcpAccessTokens(founder.userId)).toBe(1);

    const result = await resetUserPassword(admin, {
      userId: founder.userId,
      writePassword: recordWrite,
    });

    expect(result.email).toBe(founderEmail);
    // Unambiguous alphabet, pinned: this password gets retyped by hand.
    expect(result.temporaryPassword).toMatch(
      /^[abcdefghjkmnpqrstuvwxyz23456789]{16}$/,
    );
    // The caller is handed exactly what it must persist, for the right user.
    expect(writes).toEqual([
      { userId: founder.userId, password: result.temporaryPassword },
    ]);

    expect(await countSessions(founder.userId)).toBe(0);
    expect(await countMcpAccessTokens(founder.userId)).toBe(0);
  });

  it("issues a different password every time", async () => {
    const first = await resetUserPassword(admin, {
      userId: founder.userId,
      writePassword: recordWrite,
    });
    const second = await resetUserPassword(admin, {
      userId: founder.userId,
      writePassword: recordWrite,
    });

    expect(first.temporaryPassword).not.toBe(second.temporaryPassword);
  });

  it("refuses a non-admin actor and writes nothing", async () => {
    await expect(
      resetUserPassword(mentor, {
        userId: founder.userId,
        writePassword: recordWrite,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(writes).toEqual([]);
  });

  it("sends an admin resetting their own password to Account security", async () => {
    await expect(
      resetUserPassword(admin, {
        userId: admin.userId,
        writePassword: recordWrite,
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Use Account security to change your own password.",
    });

    expect(writes).toEqual([]);
  });

  it("refuses an account with no password sign-in", async () => {
    await expect(
      resetUserPassword(admin, {
        userId: socialOnlyUserId,
        writePassword: recordWrite,
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "This account has no password sign-in to reset.",
    });

    // The point of the check: no temporary password may be handed out for an
    // account that could never sign in with one.
    expect(writes).toEqual([]);
  });

  it("refuses an unknown, malformed, or soft-deleted user", async () => {
    await expect(
      resetUserPassword(admin, {
        userId: randomUUID(),
        writePassword: recordWrite,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      resetUserPassword(admin, {
        userId: "not-a-uuid",
        writePassword: recordWrite,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const deletedUserId = await insertUser("deleted", "founder");
    await insertCredentialAccount(deletedUserId);
    await pool.query("update users set deleted_at = now() where id = $1", [
      deletedUserId,
    ]);

    await expect(
      resetUserPassword(admin, {
        userId: deletedUserId,
        writePassword: recordWrite,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(writes).toEqual([]);
  });
});
