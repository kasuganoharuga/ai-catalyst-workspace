import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";

import { ServiceError } from "../errors.js";
import {
  acceptFounderInvitation,
  createFounderInvitation,
  listFounderInvitations,
  revokeFounderInvitation,
} from "./index.js";

/**
 * Integration tests against the real Postgres database (see
 * apps/web/tests/README.md for prerequisites), following the same pattern as
 * apps/web/tests/auth.db.test.ts. Named `*.db.test.ts` (not just living under
 * src/invitation/) so `test`'s `--exclude` doesn't also have to sweep up
 * future non-DB unit tests that might land in this same folder later.
 */
describe("invitation service — database integration", () => {
  const emailPrefix = `invitation-test-${randomUUID()}`;
  const createdUserIds: string[] = [];
  let admin: ActorContext;
  let nonAdmin: ActorContext;

  function testEmail(label: string): string {
    return `${emailPrefix}-${label}@example.com`;
  }

  beforeAll(async () => {
    const adminResult = await pool.query<{ id: string }>(
      "insert into users (name, email, role) values ($1, $2, 'admin') returning id",
      [`${emailPrefix}-admin`, `${emailPrefix}-admin@example.com`],
    );
    const founderResult = await pool.query<{ id: string }>(
      "insert into users (name, email, role) values ($1, $2, 'founder') returning id",
      [`${emailPrefix}-founder`, `${emailPrefix}-founder@example.com`],
    );

    createdUserIds.push(adminResult.rows[0].id, founderResult.rows[0].id);
    admin = { userId: adminResult.rows[0].id, role: "admin" };
    nonAdmin = { userId: founderResult.rows[0].id, role: "founder" };
  });

  afterAll(async () => {
    // Order matters: invitations.workspace_id cascades on workspace delete,
    // but workspaces.founder_user_id/mentor_user_id have no cascade back to
    // users, so workspaces must go before users.
    await pool.query("delete from invitations where email like $1", [
      `${emailPrefix}%`,
    ]);
    await pool.query(
      "delete from workspaces where founder_user_id = any($1::uuid[])",
      [createdUserIds],
    );
    await pool.query("delete from users where id = any($1::uuid[])", [
      createdUserIds,
    ]);
  });

  // Every accept test needs a real `pending` user row (acceptFounderInvitation
  // re-validates role/email against the database, not just the ActorContext
  // passed in) — created directly rather than through Better Auth since this
  // suite only exercises packages/services, not HTTP registration.
  async function createPendingUser(
    label: string,
  ): Promise<{ id: string; email: string }> {
    const email = testEmail(label);
    const result = await pool.query<{ id: string }>(
      "insert into users (name, email, role) values ($1, $2, 'pending') returning id",
      [email, email],
    );
    createdUserIds.push(result.rows[0].id);
    return { id: result.rows[0].id, email };
  }

  it("creates a pending founder invitation with a correctly hashed token", async () => {
    const email = testEmail("create");
    const { invitation, rawToken } = await createFounderInvitation(admin, {
      email,
    });

    expect(invitation.email).toBe(email);
    expect(invitation.status).toBe("pending");
    expect(invitation.inviteRole).toBe("founder");

    const expectedHash = createHash("sha256").update(rawToken).digest("hex");
    const { rows } = await pool.query<{ token_hash: string }>(
      "select token_hash from invitations where id = $1",
      [invitation.id],
    );
    expect(rows[0].token_hash).toBe(expectedHash);
  });

  it("rejects create from a non-admin actor", async () => {
    await expect(
      createFounderInvitation(nonAdmin, { email: testEmail("forbidden") }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects a non-string email at runtime", async () => {
    await expect(
      createFounderInvitation(admin, {
        email: 123 as unknown as string,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("maps a real unique-constraint violation to INVITATION_ALREADY_PENDING", async () => {
    const email = testEmail("duplicate");
    await createFounderInvitation(admin, { email });

    await expect(
      createFounderInvitation(admin, { email }),
    ).rejects.toMatchObject({ code: "INVITATION_ALREADY_PENDING" });
  });

  it("collides on a case/whitespace-different email via the DB trigger + partial index", async () => {
    const email = testEmail("case-collide");
    await createFounderInvitation(admin, { email });

    await expect(
      createFounderInvitation(admin, { email: `  ${email.toUpperCase()}  ` }),
    ).rejects.toMatchObject({ code: "INVITATION_ALREADY_PENDING" });
  });

  it("does not let a stale pending invitation block a new create", async () => {
    const email = testEmail("stale-create");
    const { invitation: stale } = await createFounderInvitation(admin, {
      email,
    });
    await pool.query(
      "update invitations set expires_at = now() - interval '1 day' where id = $1",
      [stale.id],
    );

    const { invitation: fresh } = await createFounderInvitation(admin, {
      email,
    });
    expect(fresh.id).not.toBe(stale.id);

    const { rows } = await pool.query<{ status: string }>(
      "select status from invitations where id = $1",
      [stale.id],
    );
    expect(rows[0].status).toBe("expired");
  });

  it("revokes a pending invitation", async () => {
    const email = testEmail("revoke");
    const { invitation } = await createFounderInvitation(admin, { email });

    const revoked = await revokeFounderInvitation(admin, invitation.id);

    expect(revoked.status).toBe("revoked");
    expect(revoked.revokedAt).not.toBeNull();

    const { rows } = await pool.query<{ revoked_by_user_id: string }>(
      "select revoked_by_user_id from invitations where id = $1",
      [invitation.id],
    );
    expect(rows[0].revoked_by_user_id).toBe(admin.userId);
  });

  it("rejects revoking an already-revoked invitation", async () => {
    const email = testEmail("revoke-twice");
    const { invitation } = await createFounderInvitation(admin, { email });
    await revokeFounderInvitation(admin, invitation.id);

    await expect(
      revokeFounderInvitation(admin, invitation.id),
    ).rejects.toMatchObject({ code: "INVITATION_NOT_PENDING" });
  });

  it("rejects revoking a nonexistent invitation", async () => {
    await expect(
      revokeFounderInvitation(admin, randomUUID()),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects a malformed invitation id before it reaches Postgres", async () => {
    await expect(
      revokeFounderInvitation(admin, "not-a-uuid"),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("expires (not revokes) a stale-but-still-pending invitation on revoke", async () => {
    const email = testEmail("stale-revoke");
    const { invitation } = await createFounderInvitation(admin, { email });
    await pool.query(
      "update invitations set expires_at = now() - interval '1 day' where id = $1",
      [invitation.id],
    );

    await expect(
      revokeFounderInvitation(admin, invitation.id),
    ).rejects.toMatchObject({ code: "INVITATION_NOT_PENDING" });

    const { rows } = await pool.query<{ status: string }>(
      "select status from invitations where id = $1",
      [invitation.id],
    );
    expect(rows[0].status).toBe("expired");
  });

  it("simulates PR 1.2's acceptance predicate returning zero rows after revoke", async () => {
    const email = testEmail("accept-predicate");
    const { invitation, rawToken } = await createFounderInvitation(admin, {
      email,
    });
    await revokeFounderInvitation(admin, invitation.id);

    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const { rows } = await pool.query(
      `select id from invitations
       where token_hash = $1 and invite_role = 'founder'
         and status = 'pending' and expires_at > now()`,
      [tokenHash],
    );
    expect(rows).toHaveLength(0);
  });

  it("allows a new invite for the same email after the prior one is revoked", async () => {
    const email = testEmail("reinvite-after-revoke");
    const { invitation: first } = await createFounderInvitation(admin, {
      email,
    });
    await revokeFounderInvitation(admin, first.id);

    const { invitation: second } = await createFounderInvitation(admin, {
      email,
    });
    expect(second.id).not.toBe(first.id);
  });

  it("lists founder invitations ordered by createdAt desc, id desc for ties", async () => {
    const emails = [
      testEmail("list-a"),
      testEmail("list-b"),
      testEmail("list-c"),
    ];
    for (const email of emails) {
      await createFounderInvitation(admin, { email });
    }

    const invitations = await listFounderInvitations(admin);
    const relevant = invitations.filter((invitation) =>
      emails.includes(invitation.email),
    );
    expect(relevant).toHaveLength(emails.length);

    for (let i = 1; i < relevant.length; i++) {
      const previous = relevant[i - 1];
      const current = relevant[i];
      if (previous.createdAt === current.createdAt) {
        expect(previous.id >= current.id).toBe(true);
      } else {
        expect(previous.createdAt >= current.createdAt).toBe(true);
      }
    }
  });

  it("rejects list from a non-admin actor", async () => {
    await expect(listFounderInvitations(nonAdmin)).rejects.toBeInstanceOf(
      ServiceError,
    );
  });

  describe("acceptFounderInvitation", () => {
    it("accepts a pending invitation: upgrades role, creates a Workspace, writes accepted fields, keeps workspace_id null", async () => {
      const user = await createPendingUser("accept-happy");
      const { invitation, rawToken } = await createFounderInvitation(admin, {
        email: user.email,
      });
      const actor: ActorContext = { userId: user.id, role: "pending" };

      const result = await acceptFounderInvitation(actor, rawToken);

      expect(result.invitation.status).toBe("accepted");
      expect(result.invitation.workspaceId).toBeNull();
      expect(result.workspace.id).toBeTruthy();

      const { rows: userRows } = await pool.query<{ role: string }>(
        "select role from users where id = $1",
        [user.id],
      );
      expect(userRows[0].role).toBe("founder");

      const { rows: wsRows } = await pool.query<{
        founder_user_id: string;
        slug: string;
      }>("select founder_user_id, slug from workspaces where id = $1", [
        result.workspace.id,
      ]);
      expect(wsRows[0].founder_user_id).toBe(user.id);
      expect(wsRows[0].slug).toMatch(/^[a-z0-9-]+-[0-9a-f]{6}$/);

      const { rows: invRows } = await pool.query<{
        invited_user_id: string;
        accepted_by_user_id: string;
        workspace_id: string | null;
      }>(
        `select invited_user_id, accepted_by_user_id, workspace_id
         from invitations where id = $1`,
        [invitation.id],
      );
      expect(invRows[0].invited_user_id).toBe(user.id);
      expect(invRows[0].accepted_by_user_id).toBe(user.id);
      expect(invRows[0].workspace_id).toBeNull();
    });

    it("rejects a Mentor invitation's token — never treats it as a Founder invitation", async () => {
      const user = await createPendingUser("accept-mentor-token");
      // Throwaway owner for the Mentor invitation's target Workspace — a
      // dedicated fixture user (not the shared `admin`/`nonAdmin`) so this
      // test can never collide with `workspaces_founder_unique` against
      // another test running in the same file, and cleanup is covered by
      // the shared afterAll (which deletes Workspaces by founder_user_id
      // for every id in createdUserIds).
      const workspaceOwner = await createPendingUser(
        "accept-mentor-token-workspace-owner",
      );
      const workspaceResult = await pool.query<{ id: string }>(
        `insert into workspaces (founder_user_id, name, slug)
         values ($1, 'Mentor Fixture Workspace', $2) returning id`,
        [workspaceOwner.id, `mentor-fixture-${randomUUID()}`],
      );
      const workspaceId = workspaceResult.rows[0].id;
      const rawToken = randomBytes(32).toString("base64url");
      const tokenHash = createHash("sha256").update(rawToken).digest("hex");
      await pool.query(
        `insert into invitations
           (email, invite_role, workspace_id, token_hash, invited_by_user_id, expires_at)
         values ($1, 'mentor', $2, $3, $4, now() + interval '7 days')`,
        [user.email, workspaceId, tokenHash, admin.userId],
      );

      const actor: ActorContext = { userId: user.id, role: "pending" };
      await expect(
        acceptFounderInvitation(actor, rawToken),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });

      const { rows: userRows } = await pool.query<{ role: string }>(
        "select role from users where id = $1",
        [user.id],
      );
      expect(userRows[0].role).toBe("pending");
    });

    it("rejects a nonexistent token", async () => {
      const user = await createPendingUser("accept-nonexistent-token");
      const actor: ActorContext = { userId: user.id, role: "pending" };

      await expect(
        acceptFounderInvitation(actor, randomUUID().replace(/-/g, "").padEnd(43, "a")),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("rejects a malformed token before it reaches Postgres", async () => {
      const user = await createPendingUser("accept-malformed-token");
      const actor: ActorContext = { userId: user.id, role: "pending" };

      await expect(
        acceptFounderInvitation(actor, "too-short"),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
      await expect(
        acceptFounderInvitation(actor, 12345),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("trims incidental whitespace from a pasted token before hashing", async () => {
      const user = await createPendingUser("accept-trim-token");
      const { rawToken } = await createFounderInvitation(admin, {
        email: user.email,
      });
      const actor: ActorContext = { userId: user.id, role: "pending" };

      const result = await acceptFounderInvitation(
        actor,
        `  ${rawToken}\n`,
      );
      expect(result.invitation.status).toBe("accepted");
    });

    it("rejects accepting an already-revoked invitation", async () => {
      const user = await createPendingUser("accept-revoked");
      const { invitation, rawToken } = await createFounderInvitation(admin, {
        email: user.email,
      });
      await revokeFounderInvitation(admin, invitation.id);

      const actor: ActorContext = { userId: user.id, role: "pending" };
      await expect(
        acceptFounderInvitation(actor, rawToken),
      ).rejects.toMatchObject({ code: "INVITATION_NOT_PENDING" });
    });

    it("rejects accepting an already-accepted invitation (no double-accept)", async () => {
      const user = await createPendingUser("accept-twice");
      const { rawToken } = await createFounderInvitation(admin, {
        email: user.email,
      });
      const actor: ActorContext = { userId: user.id, role: "pending" };
      await acceptFounderInvitation(actor, rawToken);

      // The invitation's own status (already 'accepted') is what stops the
      // replay here — it is checked before the User row is even locked, so
      // this is INVITATION_NOT_PENDING, not FORBIDDEN. (A stale ActorContext
      // claiming a User's *own* role is 'pending' when the database already
      // disagrees is the separate scenario covered below with a fresh,
      // still-pending invitation.)
      await expect(
        acceptFounderInvitation(actor, rawToken),
      ).rejects.toMatchObject({ code: "INVITATION_NOT_PENDING" });
    });

    it("expires (not accepts) a stale-but-still-pending invitation, and does not touch role/workspace", async () => {
      const user = await createPendingUser("accept-expired");
      const { invitation, rawToken } = await createFounderInvitation(admin, {
        email: user.email,
      });
      await pool.query(
        "update invitations set expires_at = now() - interval '1 day' where id = $1",
        [invitation.id],
      );

      const actor: ActorContext = { userId: user.id, role: "pending" };
      await expect(
        acceptFounderInvitation(actor, rawToken),
      ).rejects.toMatchObject({ code: "INVITATION_NOT_PENDING" });

      const { rows } = await pool.query<{
        status: string;
        revoked_by_user_id: string | null;
      }>("select status, revoked_by_user_id from invitations where id = $1", [
        invitation.id,
      ]);
      expect(rows[0].status).toBe("expired");
      expect(rows[0].revoked_by_user_id).toBeNull();

      const { rows: userRows } = await pool.query<{ role: string }>(
        "select role from users where id = $1",
        [user.id],
      );
      expect(userRows[0].role).toBe("pending");
    });

    it("rejects when the logged-in user's email does not match the invitation", async () => {
      const invitedEmail = testEmail("accept-mismatch-invited");
      const { rawToken } = await createFounderInvitation(admin, {
        email: invitedEmail,
      });
      const differentUser = await createPendingUser("accept-mismatch-actor");

      const actor: ActorContext = { userId: differentUser.id, role: "pending" };
      await expect(
        acceptFounderInvitation(actor, rawToken),
      ).rejects.toMatchObject({ code: "INVITATION_EMAIL_MISMATCH" });

      const { rows: userRows } = await pool.query<{ role: string }>(
        "select role from users where id = $1",
        [differentUser.id],
      );
      expect(userRows[0].role).toBe("pending");
    });

    it("rejects when the database role is no longer pending, even if the ActorContext claims otherwise", async () => {
      const user = await createPendingUser("accept-stale-actor-role");
      const { rawToken } = await createFounderInvitation(admin, {
        email: user.email,
      });
      // Simulates "an admin changed this user's role elsewhere" — the
      // ActorContext below still (incorrectly) claims 'pending'.
      await pool.query("update users set role = 'admin' where id = $1", [
        user.id,
      ]);

      const actor: ActorContext = { userId: user.id, role: "pending" };
      await expect(
        acceptFounderInvitation(actor, rawToken),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      const { rows } = await pool.query<{ role: string }>(
        "select role from users where id = $1",
        [user.id],
      );
      expect(rows[0].role).toBe("admin");
    });

    it("rolls back the entire transaction when the user already owns a Workspace", async () => {
      const user = await createPendingUser("accept-founder-conflict");
      const { invitation, rawToken } = await createFounderInvitation(admin, {
        email: user.email,
      });
      // Cleaned up by the shared afterAll via founder_user_id, not inline.
      await pool.query(
        `insert into workspaces (founder_user_id, name, slug)
         values ($1, 'Pre-existing Workspace', $2)`,
        [user.id, `pre-existing-${randomUUID()}`],
      );

      const actor: ActorContext = { userId: user.id, role: "pending" };
      await expect(
        acceptFounderInvitation(actor, rawToken),
      ).rejects.toMatchObject({ code: "FOUNDER_WORKSPACE_ALREADY_EXISTS" });

      const { rows: userRows } = await pool.query<{ role: string }>(
        "select role from users where id = $1",
        [user.id],
      );
      expect(userRows[0].role).toBe("pending");

      const { rows: invRows } = await pool.query<{ status: string }>(
        "select status from invitations where id = $1",
        [invitation.id],
      );
      expect(invRows[0].status).toBe("pending");

      const { rows: wsRows } = await pool.query<{ count: string }>(
        "select count(*)::text as count from workspaces where founder_user_id = $1",
        [user.id],
      );
      expect(wsRows[0].count).toBe("1");
    });

    it("lets only one of two concurrent accepts of the same token succeed", async () => {
      const user = await createPendingUser("accept-concurrent");
      const { rawToken } = await createFounderInvitation(admin, {
        email: user.email,
      });
      const actor: ActorContext = { userId: user.id, role: "pending" };

      const results = await Promise.allSettled([
        acceptFounderInvitation(actor, rawToken),
        acceptFounderInvitation(actor, rawToken),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(
        (rejected[0] as PromiseRejectedResult).reason,
      ).toMatchObject({ code: "INVITATION_NOT_PENDING" });

      const { rows: wsRows } = await pool.query<{ count: string }>(
        "select count(*)::text as count from workspaces where founder_user_id = $1",
        [user.id],
      );
      expect(wsRows[0].count).toBe("1");
    });

    it("cleans up same-email Mentor invitations: revokes the still-pending one, expires the naturally stale one", async () => {
      const user = await createPendingUser("accept-cleanup-mentor");
      const { rawToken } = await createFounderInvitation(admin, {
        email: user.email,
      });

      // Dedicated throwaway owners (not the shared admin/nonAdmin) so this
      // test can never collide with `workspaces_founder_unique` against
      // another test in this file; cleaned up by the shared afterAll.
      const workspaceOwnerA = await createPendingUser(
        "accept-cleanup-mentor-workspace-owner-a",
      );
      const workspaceOwnerB = await createPendingUser(
        "accept-cleanup-mentor-workspace-owner-b",
      );
      const workspaceA = await pool.query<{ id: string }>(
        `insert into workspaces (founder_user_id, name, slug)
         values ($1, 'Mentor Cleanup A', $2) returning id`,
        [workspaceOwnerA.id, `mentor-cleanup-a-${randomUUID()}`],
      );
      const workspaceB = await pool.query<{ id: string }>(
        `insert into workspaces (founder_user_id, name, slug)
         values ($1, 'Mentor Cleanup B', $2) returning id`,
        [workspaceOwnerB.id, `mentor-cleanup-b-${randomUUID()}`],
      );

      function tokenHashOf(raw: string): string {
        return createHash("sha256").update(raw).digest("hex");
      }

      const mentorPendingUnexpired = await pool.query<{ id: string }>(
        `insert into invitations
           (email, invite_role, workspace_id, token_hash, invited_by_user_id, expires_at)
         values ($1, 'mentor', $2, $3, $4, now() + interval '7 days')
         returning id`,
        [
          user.email,
          workspaceA.rows[0].id,
          tokenHashOf(randomUUID()),
          admin.userId,
        ],
      );
      const mentorPendingExpired = await pool.query<{ id: string }>(
        `insert into invitations
           (email, invite_role, workspace_id, token_hash, invited_by_user_id, expires_at)
         values ($1, 'mentor', $2, $3, $4, now() - interval '1 day')
         returning id`,
        [
          user.email,
          workspaceB.rows[0].id,
          tokenHashOf(randomUUID()),
          admin.userId,
        ],
      );

      const actor: ActorContext = { userId: user.id, role: "pending" };
      await acceptFounderInvitation(actor, rawToken);

      const { rows: mentorARows } = await pool.query<{
        status: string;
        revoked_by_user_id: string | null;
        revoked_at: Date | null;
      }>(
        "select status, revoked_by_user_id, revoked_at from invitations where id = $1",
        [mentorPendingUnexpired.rows[0].id],
      );
      expect(mentorARows[0].status).toBe("revoked");
      expect(mentorARows[0].revoked_by_user_id).toBe(user.id);
      expect(mentorARows[0].revoked_at).not.toBeNull();

      const { rows: mentorBRows } = await pool.query<{
        status: string;
        revoked_by_user_id: string | null;
        revoked_at: Date | null;
      }>(
        "select status, revoked_by_user_id, revoked_at from invitations where id = $1",
        [mentorPendingExpired.rows[0].id],
      );
      expect(mentorBRows[0].status).toBe("expired");
      expect(mentorBRows[0].revoked_by_user_id).toBeNull();
      expect(mentorBRows[0].revoked_at).toBeNull();
    });

    it("retries the Workspace slug deterministically on a real collision instead of relying on random luck", async () => {
      const user = await createPendingUser("accept-slug-retry");
      const { rawToken } = await createFounderInvitation(admin, {
        email: user.email,
      });

      // localPart of the fixture email is `${emailPrefix}-accept-slug-retry`
      // (see testEmail) — pre-create a Workspace with the exact slug the
      // first two deterministic suffixes below would produce, forcing two
      // real ON CONFLICT collisions before the third attempt succeeds.
      const localPart = user.email.split("@")[0];
      const base = localPart
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);
      const collidingSlug = `${base}-abcdef`;
      // Dedicated throwaway owner (not the shared admin/nonAdmin) so this
      // fixture Workspace can never collide with `workspaces_founder_unique`
      // against another test; cleaned up by the shared afterAll.
      const collidingWorkspaceOwner = await createPendingUser(
        "accept-slug-retry-workspace-owner",
      );
      await pool.query(
        `insert into workspaces (founder_user_id, name, slug)
         values ($1, 'Slug Collision Fixture', $2)`,
        [collidingWorkspaceOwner.id, collidingSlug],
      );

      let callCount = 0;
      const suffixes = ["abcdef", "abcdef", "123456"];
      const actor: ActorContext = { userId: user.id, role: "pending" };

      const result = await acceptFounderInvitation(actor, rawToken, {
        createWorkspaceSuffix: () => suffixes[callCount++],
      });

      expect(callCount).toBe(3);
      expect(result.workspace.slug).toBe(`${base}-123456`);
    });
  });
});
