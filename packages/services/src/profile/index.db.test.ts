import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pool } from "@ai-catalyst/db";
import { createWebActorContext } from "@ai-catalyst/contracts/actor-context";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";

import {
  getMyProfile,
  hasChangedInvitationPassword,
  setPreferredAiProvider,
  updateMyProfile,
} from "./index.js";

/**
 * Integration tests against the real Postgres database (see
 * apps/web/tests/README.md for prerequisites). Named `*.db.test.ts` so
 * `test`'s `--exclude` skips it while `test:db` runs it.
 */
describe("profile service — database integration", () => {
  const idPrefix = `profile-test-${randomUUID()}`;
  const createdUserIds: string[] = [];

  async function createUser(
    label: string,
    role: "pending" | "founder" | "mentor" | "admin" = "founder",
  ): Promise<ActorContext> {
    const email = `${idPrefix}-${label}@example.com`;
    const result = await pool.query<{ id: string }>(
      `insert into users (name, email, role) values ($1, $2, $3) returning id`,
      [email, email, role],
    );
    const id = result.rows[0].id;
    createdUserIds.push(id);
    return createWebActorContext({ userId: id, role });
  }

  beforeAll(async () => {
    await pool.query("select 1");
  });

  afterAll(async () => {
    // user_profiles cascades on users delete, so removing the fixture
    // users is enough to clean both tables.
    await pool.query("delete from users where id = any($1::uuid[])", [
      createdUserIds,
    ]);
  });

  describe("getMyProfile", () => {
    it("returns an all-null profile when no row exists yet", async () => {
      const actor = await createUser("empty");
      const profile = await getMyProfile(actor);

      expect(profile).toMatchObject({
        userId: actor.userId,
        firstName: null,
        lastName: null,
        contactEmail: null,
        jobTitle: null,
        bio: null,
        linkedinUrl: null,
        locale: "en-AU",
        createdAt: null,
        updatedAt: null,
      });
    });

    it("rejects a pending account", async () => {
      const actor = await createUser("pending-read", "pending");
      await expect(getMyProfile(actor)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });
  });

  // The dashboard prompts on this until it flips. Better Auth writes the
  // credential row's updated_at through an onUpdate hook when
  // changePassword runs, so the two timestamps diverge the first time a
  // password is set by hand.
  describe("hasChangedInvitationPassword", () => {
    async function createCredentialAccount(
      userId: string,
      options: { changedAgo?: string } = {},
    ): Promise<void> {
      // Mirrors Better Auth's own insert: both timestamps from one clock
      // read. `changedAgo` moves updated_at forward the way a real
      // password change would.
      await pool.query(
        `insert into accounts (user_id, account_id, provider_id, password, created_at, updated_at)
         values ($1, $2, 'credential', 'not-a-real-hash', now(), now() + coalesce($3::interval, interval '0'))`,
        [userId, userId, options.changedAgo ?? null],
      );
    }

    it("is false while the account still has its original password", async () => {
      const actor = await createUser("password-untouched");
      await createCredentialAccount(actor.userId);

      expect(await hasChangedInvitationPassword(actor)).toBe(false);
    });

    it("is true once the credential row has been updated", async () => {
      const actor = await createUser("password-changed");
      await createCredentialAccount(actor.userId, { changedAgo: "10 minutes" });

      expect(await hasChangedInvitationPassword(actor)).toBe(true);
    });

    // Sub-second drift between the two timestamps at creation is clock
    // noise, not somebody changing their password inside a second.
    it("ignores sub-second drift between the timestamps", async () => {
      const actor = await createUser("password-drift");
      await createCredentialAccount(actor.userId, {
        changedAgo: "300 milliseconds",
      });

      expect(await hasChangedInvitationPassword(actor)).toBe(false);
    });

    // Nagging an account with no password to change is a prompt nobody can
    // ever satisfy, so the no-row case reports done.
    it("reports true when there is no credential row at all", async () => {
      const actor = await createUser("password-no-credential");

      expect(await hasChangedInvitationPassword(actor)).toBe(true);
    });
  });

  describe("updateMyProfile", () => {
    it("creates the row on first save and reads back through getMyProfile", async () => {
      const actor = await createUser("first-save");

      const saved = await updateMyProfile(actor, {
        firstName: "Sicong",
        lastName: "Fu",
        jobTitle: "Founder",
      });
      expect(saved).toMatchObject({
        firstName: "Sicong",
        lastName: "Fu",
        jobTitle: "Founder",
      });
      expect(saved.createdAt).not.toBeNull();

      await expect(getMyProfile(actor)).resolves.toMatchObject({
        firstName: "Sicong",
        lastName: "Fu",
        jobTitle: "Founder",
      });
    });

    it("leaves unmentioned fields untouched on a partial update", async () => {
      const actor = await createUser("partial");
      await updateMyProfile(actor, { firstName: "Ada", jobTitle: "CTO" });

      const updated = await updateMyProfile(actor, { firstName: "Grace" });

      expect(updated.firstName).toBe("Grace");
      expect(updated.jobTitle).toBe("CTO");
    });

    it("clears a field when passed an explicit null", async () => {
      const actor = await createUser("clear");
      await updateMyProfile(actor, { firstName: "Ada", jobTitle: "CTO" });

      const updated = await updateMyProfile(actor, { jobTitle: null });

      expect(updated.jobTitle).toBeNull();
      expect(updated.firstName).toBe("Ada");
    });

    it("treats a blank string as clearing the field rather than violating the not-blank constraint", async () => {
      const actor = await createUser("blank");
      await updateMyProfile(actor, { firstName: "Ada" });

      const updated = await updateMyProfile(actor, { firstName: "   " });

      expect(updated.firstName).toBeNull();
    });

    it("trims surrounding whitespace", async () => {
      const actor = await createUser("trim");
      const updated = await updateMyProfile(actor, {
        firstName: "  Sicong  ",
      });
      expect(updated.firstName).toBe("Sicong");
    });

    it("bumps updated_at on a subsequent save", async () => {
      const actor = await createUser("touch");
      const first = await updateMyProfile(actor, { firstName: "Ada" });
      const second = await updateMyProfile(actor, { firstName: "Grace" });

      expect(new Date(second.updatedAt as string).getTime()).toBeGreaterThan(
        new Date(first.updatedAt as string).getTime() - 1,
      );
    });

    it("rejects a non-string, non-null value", async () => {
      const actor = await createUser("bad-type");
      await expect(
        updateMyProfile(actor, { firstName: 42 }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("rejects an over-long value", async () => {
      const actor = await createUser("too-long");
      await expect(
        updateMyProfile(actor, { firstName: "x".repeat(121) }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("rejects a malformed contact email", async () => {
      const actor = await createUser("bad-email");
      await expect(
        updateMyProfile(actor, { contactEmail: "not-an-email" }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("accepts a well-formed contact email", async () => {
      const actor = await createUser("good-email");
      const updated = await updateMyProfile(actor, {
        contactEmail: "founder@example.com",
      });
      expect(updated.contactEmail).toBe("founder@example.com");
    });

    it("rejects a linkedin value that is not a URL", async () => {
      const actor = await createUser("bad-url");
      await expect(
        updateMyProfile(actor, { linkedinUrl: "linkedin.com/in/someone" }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("rejects a javascript: URL", async () => {
      const actor = await createUser("xss-url");
      await expect(
        updateMyProfile(actor, { linkedinUrl: "javascript:alert(1)" }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("accepts an https URL", async () => {
      const actor = await createUser("good-url");
      const updated = await updateMyProfile(actor, {
        linkedinUrl: "https://www.linkedin.com/in/someone",
      });
      expect(updated.linkedinUrl).toBe("https://www.linkedin.com/in/someone");
    });

    it("rejects an update with no editable fields", async () => {
      const actor = await createUser("empty-update");
      await expect(updateMyProfile(actor, {})).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
      });
    });

    it("ignores fields that are not user-editable", async () => {
      const actor = await createUser("non-editable");
      await expect(
        updateMyProfile(actor, { locale: "fr-FR" }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("rejects a non-object payload", async () => {
      const actor = await createUser("bad-payload");
      await expect(updateMyProfile(actor, "nope")).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
      });
    });

    it("keeps one user's write out of another user's profile", async () => {
      const first = await createUser("isolation-a");
      const second = await createUser("isolation-b");

      await updateMyProfile(first, { firstName: "First" });
      await updateMyProfile(second, { firstName: "Second" });

      await expect(getMyProfile(first)).resolves.toMatchObject({
        firstName: "First",
      });
      await expect(getMyProfile(second)).resolves.toMatchObject({
        firstName: "Second",
      });
    });

    it("rejects a pending account", async () => {
      const actor = await createUser("pending-write", "pending");
      await expect(
        updateMyProfile(actor, { firstName: "Nope" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("setPreferredAiProvider", () => {
    it("creates the row on first save", async () => {
      const actor = await createUser("provider-first-save");

      const saved = await setPreferredAiProvider(actor, "openai");

      expect(saved.preferredAiProvider).toBe("openai");
      await expect(getMyProfile(actor)).resolves.toMatchObject({
        preferredAiProvider: "openai",
      });
    });

    it("replaces an earlier choice", async () => {
      const actor = await createUser("provider-switch");
      await setPreferredAiProvider(actor, "claude");

      const switched = await setPreferredAiProvider(actor, "openai");

      expect(switched.preferredAiProvider).toBe("openai");
    });

    // The whole reason this isn't an EDITABLE_FIELDS entry: a founder
    // switching assistant must not lose the details they already saved,
    // and an ordinary profile save must not clear the provider.
    it("leaves the rest of the profile alone", async () => {
      const actor = await createUser("provider-preserves");
      await updateMyProfile(actor, { firstName: "Ada", jobTitle: "CTO" });

      const saved = await setPreferredAiProvider(actor, "claude");

      expect(saved).toMatchObject({
        firstName: "Ada",
        jobTitle: "CTO",
        preferredAiProvider: "claude",
      });
    });

    it("survives an ordinary profile save", async () => {
      const actor = await createUser("provider-survives");
      await setPreferredAiProvider(actor, "openai");

      const updated = await updateMyProfile(actor, { firstName: "Grace" });

      expect(updated.preferredAiProvider).toBe("openai");
    });

    it("rejects a provider the check constraint doesn't know", async () => {
      const actor = await createUser("provider-unknown");
      await expect(
        setPreferredAiProvider(actor, "gemini"),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    // Null would re-open the first-run dialog, so it is rejected rather
    // than treated as "clear this field" the way updateMyProfile does.
    it("rejects null", async () => {
      const actor = await createUser("provider-null");
      await expect(setPreferredAiProvider(actor, null)).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
      });
    });

    it("rejects a pending account", async () => {
      const actor = await createUser("provider-pending", "pending");
      await expect(
        setPreferredAiProvider(actor, "claude"),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });
});
