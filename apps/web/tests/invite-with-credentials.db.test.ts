import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { pool } from "@ai-catalyst/db";

import { auth } from "@/lib/auth";
import { getEmailSender } from "@/lib/email";
import { inviteWithCredentials } from "@/lib/invite-with-credentials";
import { createInvitedCredentialUser } from "@/lib/provision-invited-account";

vi.mock("@/lib/email", () => ({
  getEmailSender: vi.fn(),
  isEmailDiscarded: () => true,
}));

describe("createInvitedCredentialUser", () => {
  const email = `provision-test-${randomUUID()}@example.com`;
  const password = "correct-horse-battery-staple";
  let userId: string | undefined;

  afterAll(async () => {
    if (!userId) return;
    await pool.query("delete from sessions where user_id = $1", [userId]);
    await pool.query("delete from accounts where user_id = $1", [userId]);
    await pool.query("delete from users where id = $1", [userId]);
  });

  it("creates a pending password account without issuing a session", async () => {
    userId = await createInvitedCredentialUser(email, password);

    const { rows } = await pool.query<{
      role: string;
      email_verified: boolean;
    }>("select role, email_verified from users where id = $1", [userId]);
    expect(rows[0]).toMatchObject({ role: "pending", email_verified: true });

    const sessions = await pool.query(
      "select id from sessions where user_id = $1",
      [userId],
    );
    expect(sessions.rowCount).toBe(0);

    const signedIn = await auth.api.signInEmail({
      body: { email, password },
    });
    expect(signedIn.user.id).toBe(userId);
  });
});

describe("inviteWithCredentials", () => {
  const emailPrefix = `invite-creds-${randomUUID()}`;
  const createdUserIds: string[] = [];
  const enqueue = vi.fn();

  beforeEach(() => {
    enqueue.mockReset();
    enqueue.mockResolvedValue(undefined);
    vi.mocked(getEmailSender).mockReturnValue({ enqueue });
  });

  afterAll(async () => {
    await pool.query("delete from invitations where email like $1", [
      `${emailPrefix}%`,
    ]);
    await pool.query(
      "delete from user_active_contexts where user_id = any($1::uuid[])",
      [createdUserIds],
    );
    await pool.query(
      "delete from workspaces where founder_user_id = any($1::uuid[])",
      [createdUserIds],
    );
    await pool.query("delete from sessions where user_id = any($1::uuid[])", [
      createdUserIds,
    ]);
    await pool.query("delete from accounts where user_id = any($1::uuid[])", [
      createdUserIds,
    ]);
    await pool.query("delete from users where id = any($1::uuid[])", [
      createdUserIds,
    ]);
  });

  it("emails login, account, and password, and the founder can sign in", async () => {
    const mentor = await pool.query<{ id: string }>(
      "insert into users (name, email, role) values ($1, $2, 'mentor') returning id",
      [`${emailPrefix}-mentor`, `${emailPrefix}-mentor@example.com`],
    );
    createdUserIds.push(mentor.rows[0].id);

    const founderEmail = `${emailPrefix}-founder@example.com`;
    const result = await inviteWithCredentials(
      { userId: mentor.rows[0].id, role: "mentor" },
      { email: founderEmail, inviteRole: "founder" },
    );

    expect(result.emailSent).toBe(true);
    expect(result.initialPassword).toHaveLength(16);
    expect(enqueue).toHaveBeenCalledTimes(1);
    const message = enqueue.mock.calls[0]?.[0] as {
      text: string;
      to: string;
    };
    expect(message.to).toBe(founderEmail);
    expect(message.text).toContain(`Account: ${founderEmail}`);
    expect(message.text).toContain(`Password: ${result.initialPassword}`);
    expect(message.text).toContain("Login:");
    expect(message.text).not.toMatch(/register|pending|code is/i);

    const founder = await pool.query<{ id: string; role: string }>(
      "select id, role from users where email = $1",
      [founderEmail],
    );
    createdUserIds.push(founder.rows[0].id);
    expect(founder.rows[0].role).toBe("founder");

    const signedIn = await auth.api.signInEmail({
      body: { email: founderEmail, password: result.initialPassword },
    });
    expect(signedIn.user.id).toBe(founder.rows[0].id);
  });
});
