import { createHash, randomBytes } from "node:crypto";
import type { PoolClient } from "pg";

import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type {
  Invitation,
  Venture,
  WorkspaceSummary,
} from "@ai-catalyst/shared";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import { withTransaction } from "@ai-catalyst/services/internal/transaction";
import { createDefaultVentureForNewWorkspace } from "@ai-catalyst/services/venture";
import { setInitialActiveContext } from "@ai-catalyst/services/workspace/active-context";
import { insertWorkspaceWithRetry } from "@ai-catalyst/services/workspace/internal/insert-workspace";

import {
  mapInvitation,
  type InvitationRow,
} from "@ai-catalyst/services/invitation/internal/rows";
import { isPostgresError } from "@ai-catalyst/services/invitation/internal/pg-error";
import { normalizeAndValidateInvitationToken } from "@ai-catalyst/services/invitation/internal/validate";
import { acceptPrologue } from "@ai-catalyst/services/invitation/internal/accept-prologue";

export interface AcceptInvitationDependencies {
  // Test-only seam: production always uses randomBytes(3).toString("hex").
  // Deterministic sequences let tests force a real slug collision instead of
  // relying on random-collision odds.
  createWorkspaceSuffix?: () => string;
  createVentureSuffix?: () => string;
}

/**
 * Resolve inviting mentor at accept time — demoted/deleted inviter yields unmentored workspace.
 */
async function resolveInvitingMentorUserId(
  client: PoolClient,
  invitedByUserId: string | null,
): Promise<string | null> {
  // Older invitations, and any created by a system path, may have no inviter.
  if (!invitedByUserId) {
    return null;
  }

  const result = await client.query<{ role: string; deleted_at: Date | null }>(
    `select role, deleted_at from users where id = $1`,
    [invitedByUserId],
  );

  const row = result.rows[0];
  if (!row || row.deleted_at !== null || row.role !== "mentor") {
    return null;
  }

  return invitedByUserId;
}

// Single txn: lock → validate → role upgrade → workspace/venture → revoke siblings.
export async function acceptFounderInvitation(
  actor: ActorContext,
  rawToken: unknown,
  deps: AcceptInvitationDependencies = {},
): Promise<{
  invitation: Invitation;
  workspace: WorkspaceSummary;
  venture: Venture;
}> {
  // Session role fast-fail only — authoritative check is locked user row below.
  assertRole(actor, ["pending"]);

  const token = normalizeAndValidateInvitationToken(rawToken);
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const createWorkspaceSuffix =
    deps.createWorkspaceSuffix ?? (() => randomBytes(3).toString("hex"));
  const createVentureSuffix =
    deps.createVentureSuffix ?? (() => randomBytes(3).toString("hex"));

  // Deferred expiry error — commit must succeed before throw (same as revoke).
  let deferredError: ServiceError | undefined;
  let invitation: Invitation | undefined;
  let workspace: WorkspaceSummary | undefined;
  let venture: Venture | undefined;

  try {
    await withTransaction(async (client) => {
      const outcome = await acceptPrologue(client, actor, {
        tokenHash,
        inviteRole: "founder",
        notFoundMessage: "Founder invitation not found.",
        onWorkspaceBound: (target) => {
          // Founder invitations must have null workspace_id — corruption trip wire.
          throw new Error(
            `Founder invitation ${target.id} unexpectedly has a non-null workspace_id.`,
          );
        },
      });

      if ("expired" in outcome) {
        deferredError = new ServiceError(
          "INVITATION_NOT_PENDING",
          "The invitation has expired and can no longer be accepted.",
        );
        return;
      }

      const { target } = outcome;

      // Conditional role update — zero rows means stale/replayed accept aborts.
      const roleUpdate = await client.query(
        `update users
         set role = 'founder'
         where id = $1 and role = 'pending' and deleted_at is null
         returning id`,
        [actor.userId],
      );
      if (roleUpdate.rowCount === 0) {
        throw new ServiceError(
          "FORBIDDEN",
          "Only an account awaiting invitation acceptance can accept this invitation.",
        );
      }

      const createdWorkspace = await insertWorkspaceWithRetry(
        client,
        actor.userId,
        target.email,
        createWorkspaceSuffix,
        await resolveInvitingMentorUserId(client, target.invited_by_user_id),
      );

      const createdVenture = await createDefaultVentureForNewWorkspace(
        client,
        createdWorkspace.id,
        actor.userId,
        target.email,
        { createSlugSuffix: createVentureSuffix },
      );

      await setInitialActiveContext(
        client,
        actor.userId,
        createdWorkspace.id,
        createdVenture.id,
      );

      // workspace_id stays null — link is invited_user_id → founder_user_id.
      const acceptedResult = await client.query<InvitationRow>(
        `update invitations
         set status = 'accepted', invited_user_id = $1, accepted_by_user_id = $1, accepted_at = now()
         where id = $2 and invite_role = 'founder' and status = 'pending'
         returning *`,
        [actor.userId, target.id],
      );

      // Expire naturally stale siblings separately — no revoked_by on natural expiry.
      await client.query(
        `update invitations
         set status = 'expired'
         where id <> $1
           and lower(trim(email)) = lower(trim($2))
           and status = 'pending'
           and expires_at <= now()`,
        [target.id, target.email],
      );

      // Revoke remaining pending same-email invites (any role).
      await client.query(
        `update invitations
         set status = 'revoked', revoked_by_user_id = $1, revoked_at = now()
         where id <> $2
           and lower(trim(email)) = lower(trim($3))
           and status = 'pending'`,
        [actor.userId, target.id, target.email],
      );

      invitation = mapInvitation(acceptedResult.rows[0]);
      workspace = createdWorkspace;
      venture = createdVenture;
    });
  } catch (error) {
    if (
      isPostgresError(error) &&
      error.code === "23505" &&
      error.constraint === "workspaces_founder_live_unique"
    ) {
      throw new ServiceError(
        "FOUNDER_WORKSPACE_ALREADY_EXISTS",
        "This account already has a Workspace.",
      );
    }

    throw error;
  }

  if (deferredError) {
    throw deferredError;
  }
  return { invitation: invitation!, workspace: workspace!, venture: venture! };
}
