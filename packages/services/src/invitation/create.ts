import { createHash, randomBytes } from "node:crypto";

import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type { Invitation } from "@ai-catalyst/shared";

import { recordAccountEvent } from "@ai-catalyst/services/audit/account-events";
import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import { withTransaction } from "@ai-catalyst/services/internal/transaction";

import {
  INVITATION_COLUMNS,
  mapInvitation,
  type InvitationRow,
  type InviteRole,
} from "@ai-catalyst/services/invitation/internal/rows";
import { isPostgresError } from "@ai-catalyst/services/invitation/internal/pg-error";
import { validateCreateInvitationInput } from "@ai-catalyst/services/invitation/internal/validate";
import { expireStaleInvitations } from "@ai-catalyst/services/invitation/internal/lookups";

// Founder and mentor invitations share acceptance locking (email family).
// Founder <- admin/mentor; mentor <- admin only (platform-level).
const INVITATION_TTL_DAYS = 7;

async function createInvitation(
  actor: ActorContext,
  inviteRole: InviteRole,
  input: { email: string; personalMessage?: string },
): Promise<{ invitation: Invitation; rawToken: string }> {
  validateCreateInvitationInput(input);

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");

  try {
    const row = await withTransaction(async (client) => {
      await expireStaleInvitations(client, inviteRole, input.email);

      // workspace_id null: founder invite pre-workspace; mentor invite platform-level.
      const result = await client.query<InvitationRow>(
        `insert into invitations
           (email, invite_role, token_hash, invited_by_user_id, expires_at, personal_message)
         values
           ($1, $2, $3, $4, now() + ($5 * interval '1 day'), $6)
         returning ${INVITATION_COLUMNS}`,
        [
          input.email,
          inviteRole,
          tokenHash,
          actor.userId,
          INVITATION_TTL_DAYS,
          input.personalMessage ?? null,
        ],
      );
      return result.rows[0];
    });

    const invitation = mapInvitation(row);
    // The invited email is deliberately absent — it is a denied log key. The
    // invitation id resolves back to it in `invitations` when the trail is read.
    recordAccountEvent("account_invitation_created", {
      actor,
      invitationId: invitation.id,
      inviteRole,
    });

    return { invitation, rawToken };
  } catch (error) {
    // withTransaction already rolled back — this only maps the resulting
    // error, it does not need to roll back anything itself.
    const pendingUniqueConstraint =
      inviteRole === "founder"
        ? "invitations_pending_founder_unique"
        : "invitations_pending_mentor_unique";

    if (
      isPostgresError(error) &&
      error.code === "23505" &&
      error.constraint === pendingUniqueConstraint
    ) {
      throw new ServiceError(
        "INVITATION_ALREADY_PENDING",
        inviteRole === "founder"
          ? "A pending Founder invitation already exists for this email."
          : "A pending Mentor invitation already exists for this email.",
      );
    }

    throw error;
  }
}

// Mentor-issued founder invite sets workspaces.mentor_user_id from invited_by at accept.
export async function createFounderInvitation(
  actor: ActorContext,
  input: { email: string; personalMessage?: string },
): Promise<{ invitation: Invitation; rawToken: string }> {
  assertRole(actor, ["admin", "mentor"]);
  return createInvitation(actor, "founder", input);
}

// Admin-only — mentors must not recruit mentors without a gatekeeper.
export async function createMentorInvitation(
  actor: ActorContext,
  input: { email: string; personalMessage?: string },
): Promise<{ invitation: Invitation; rawToken: string }> {
  assertRole(actor, ["admin"]);
  return createInvitation(actor, "mentor", input);
}
