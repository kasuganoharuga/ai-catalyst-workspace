import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";

import { ServiceError } from "../errors.js";
import {
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
    await pool.query("delete from invitations where email like $1", [
      `${emailPrefix}%`,
    ]);
    await pool.query("delete from users where id = any($1::uuid[])", [
      createdUserIds,
    ]);
  });

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
});
