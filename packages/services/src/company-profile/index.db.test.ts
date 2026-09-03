import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pool } from "@ai-catalyst/db";
import { createWebActorContext } from "@ai-catalyst/contracts/actor-context";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";

import { createVenture } from "../venture/index.js";
import { setActiveVenture } from "../workspace/active-context.js";
import { getMyCompanyProfile, updateMyCompanyProfile } from "./index.js";

describe("company-profile service — database integration", () => {
  const idPrefix = `company-profile-test-${randomUUID()}`;
  const createdUserIds: string[] = [];

  async function createFounder(
    label: string,
  ): Promise<{ actor: ActorContext; workspaceId: string }> {
    const email = `${idPrefix}-${label}@example.com`;
    const userResult = await pool.query<{ id: string }>(
      `insert into users (name, email, role) values ($1, $2, 'founder') returning id`,
      [`${idPrefix}-${label}`, email],
    );
    createdUserIds.push(userResult.rows[0].id);
    const actor = createWebActorContext({
      userId: userResult.rows[0].id,
      role: "founder",
    });

    const workspaceResult = await pool.query<{ id: string }>(
      `insert into workspaces (founder_user_id, name, slug)
       values ($1, $2, $3) returning id`,
      [actor.userId, `Fixture ${label}`, `${idPrefix}-${label}`],
    );

    return { actor, workspaceId: workspaceResult.rows[0].id };
  }

  beforeAll(async () => {
    await pool.query("select 1");
  });

  afterAll(async () => {
    await pool.query(
      "delete from user_active_contexts where user_id = any($1::uuid[])",
      [createdUserIds],
    );
    await pool.query(
      "delete from company_profiles where workspace_id in (select id from workspaces where founder_user_id = any($1::uuid[]))",
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

  describe("getMyCompanyProfile", () => {
    it("returns an empty profile when no row exists yet", async () => {
      const { actor, workspaceId } = await createFounder("empty");

      await expect(getMyCompanyProfile(actor)).resolves.toMatchObject({
        id: null,
        workspaceId,
        ventureId: null,
        name: null,
        status: null,
        createdAt: null,
        updatedAt: null,
      });
    });
  });

  describe("updateMyCompanyProfile", () => {
    it("requires an active venture on first save", async () => {
      const { actor } = await createFounder("no-venture");
      await createVenture(actor, { name: "Unselected Idea" });

      await expect(
        updateMyCompanyProfile(actor, { name: "Acme Pty Ltd" }),
      ).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
        message: expect.stringContaining("current idea"),
      });
    });

    it("creates the row on first save and reads back through getMyCompanyProfile", async () => {
      const { actor } = await createFounder("first-save");
      const venture = await createVenture(actor, { name: "Acme Idea" });
      await setActiveVenture(actor, venture.id);

      const saved = await updateMyCompanyProfile(actor, {
        name: "Acme Pty Ltd",
        oneLiner: "Building the future",
        websiteUrl: "https://example.com",
        hqCountry: "AU",
        foundedYear: 2024,
      });

      expect(saved).toMatchObject({
        name: "Acme Pty Ltd",
        ventureId: venture.id,
        oneLiner: "Building the future",
        websiteUrl: "https://example.com",
        hqCountry: "AU",
        foundedYear: 2024,
        status: "active",
      });
      expect(saved.createdAt).not.toBeNull();
      expect(saved.hqAddressFull).toBe("AU");

      await expect(getMyCompanyProfile(actor)).resolves.toMatchObject({
        name: "Acme Pty Ltd",
        ventureId: venture.id,
      });
    });

    it("leaves unmentioned fields untouched on a partial update", async () => {
      const { actor } = await createFounder("partial");
      const venture = await createVenture(actor, { name: "Partial Idea" });
      await setActiveVenture(actor, venture.id);
      await updateMyCompanyProfile(actor, {
        name: "Acme Pty Ltd",
        oneLiner: "Original pitch",
      });

      const updated = await updateMyCompanyProfile(actor, {
        oneLiner: "Updated pitch",
      });

      expect(updated.name).toBe("Acme Pty Ltd");
      expect(updated.oneLiner).toBe("Updated pitch");
    });

    it("rejects clearing the company name on update", async () => {
      const { actor } = await createFounder("clear-name");
      const venture = await createVenture(actor, { name: "Name Guard Idea" });
      await setActiveVenture(actor, venture.id);
      await updateMyCompanyProfile(actor, { name: "Acme Pty Ltd" });

      await expect(
        updateMyCompanyProfile(actor, { name: null }),
      ).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
      });
    });

    // These two guard the fix for a nested-transaction bug: the first-save
    // path used to call getActiveContext(actor)/getVenture(actor, ...),
    // each opening its own pool connection while this function's own
    // transaction was still open on a different client. It now passes its
    // own client through (ensureAndReadActiveContext + getVenture's
    // executor param), so both live in the same transaction — which means
    // a self-heal write that happens on the way to a validation failure
    // rolls back with everything else, rather than silently committing on
    // its own connection the way it used to.
    it("rolls back a fresh active-context row when the first save fails before an idea is chosen", async () => {
      const { actor } = await createFounder("atomic-insert-rollback");
      await createVenture(actor, { name: "Unselected Idea" });

      // No user_active_contexts row exists yet for this actor, so
      // ensureAndReadActiveContext's insert is a real write, not a no-op.
      await expect(
        updateMyCompanyProfile(actor, { name: "Acme Pty Ltd" }),
      ).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
        message: expect.stringContaining("current idea"),
      });

      // Under the old nested-transaction bug this insert ran on its own
      // already-committed connection and would leave a row behind even
      // though the overall save failed. It now shares this function's
      // transaction, so a failed save leaves no trace.
      const row = await pool.query(
        `select 1 from user_active_contexts where user_id = $1`,
        [actor.userId],
      );
      expect(row.rowCount).toBe(0);
    });

    it("rolls back a stale-context self-heal when the first save still fails", async () => {
      const { actor } = await createFounder("stale-self-heal");
      const other = await createFounder("stale-self-heal-other");
      const otherVenture = await createVenture(other.actor, {
        name: "Other Founder's Idea",
      });

      // Simulate a stale user_active_contexts row pointing at a different
      // Workspace/Venture — the scenario ensureAndReadActiveContext's
      // self-heal branch exists to correct. Correcting it always nulls
      // the Venture, so this call fails the same "choose an idea" check
      // as the fresh-row case above.
      await pool.query(
        `insert into user_active_contexts (user_id, active_workspace_id, active_venture_id)
         values ($1, $2, $3)`,
        [actor.userId, other.workspaceId, otherVenture.id],
      );

      await expect(
        updateMyCompanyProfile(actor, { name: "Acme Pty Ltd" }),
      ).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
        message: expect.stringContaining("current idea"),
      });

      // The correction to the actor's own Workspace happened on the same
      // transaction as the (failed) save, so it rolls back too — the row
      // still shows the stale Workspace/Venture. A later call that
      // actually succeeds (e.g. a plain read) will self-heal it for real.
      const row = await pool.query<{
        active_workspace_id: string;
        active_venture_id: string | null;
      }>(
        `select active_workspace_id, active_venture_id
         from user_active_contexts where user_id = $1`,
        [actor.userId],
      );
      expect(row.rows[0].active_workspace_id).toBe(other.workspaceId);
      expect(row.rows[0].active_venture_id).toBe(otherVenture.id);
    });
  });
});
