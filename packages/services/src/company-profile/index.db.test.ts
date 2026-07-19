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
  });
});
