import { createHash } from "node:crypto";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type {
  Invitation,
  Venture,
  WorkspaceSummary,
} from "@ai-catalyst/shared";

import { recordAccountEvent } from "@ai-catalyst/services/audit/account-events";
import { ServiceError, assertRole } from "@ai-catalyst/services/errors";

import type { InviteRole } from "@ai-catalyst/services/invitation/internal/rows";
import { normalizeAndValidateInvitationToken } from "@ai-catalyst/services/invitation/internal/validate";
import {
  acceptFounderInvitation,
  type AcceptInvitationDependencies,
} from "@ai-catalyst/services/invitation/accept-founder";
import { acceptMentorInvitation } from "@ai-catalyst/services/invitation/accept-mentor";

export type AcceptedInvitation =
  | {
      inviteRole: "founder";
      invitation: Invitation;
      workspace: WorkspaceSummary;
      venture: Venture;
    }
  | { inviteRole: "mentor"; invitation: Invitation };

/**
 * Route opaque token to founder or mentor accept — role must not leak to caller.
 * Unlocked lookup only picks path; accept functions re-lock authoritatively.
 */
export async function acceptInvitation(
  actor: ActorContext,
  rawToken: unknown,
  deps: AcceptInvitationDependencies = {},
): Promise<AcceptedInvitation> {
  // Pending fast-fail before DB — not authoritative; blocks signed-in founder probing.
  assertRole(actor, ["pending"]);

  const token = normalizeAndValidateInvitationToken(rawToken);
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const result = await pool.query<{ invite_role: InviteRole }>(
    `select invite_role from invitations where token_hash = $1`,
    [tokenHash],
  );

  const inviteRole = result.rows[0]?.invite_role;
  if (!inviteRole) {
    throw new ServiceError("NOT_FOUND", "Invitation not found.");
  }

  if (inviteRole === "mentor") {
    const { invitation } = await acceptMentorInvitation(actor, token);
    recordAccountEvent("account_invitation_accepted", {
      actor,
      invitationId: invitation.id,
      inviteRole,
    });
    return { inviteRole, invitation };
  }

  const accepted = await acceptFounderInvitation(actor, token, deps);
  // The moment a `pending` account becomes a real one — the completion of a
  // hand-delivered code, and the event this trail exists to pair with
  // `account_invitation_created`.
  recordAccountEvent("account_invitation_accepted", {
    actor,
    invitationId: accepted.invitation.id,
    inviteRole,
    workspaceId: accepted.workspace.id,
  });
  return { inviteRole, ...accepted };
}
