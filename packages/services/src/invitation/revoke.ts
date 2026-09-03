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
import {
  assertActorOwnsInvitation,
  lockInvitation,
} from "@ai-catalyst/services/invitation/internal/lookups";
import { assertValidInvitationId } from "@ai-catalyst/services/invitation/internal/validate";

async function revokeInvitation(
  actor: ActorContext,
  inviteRole: InviteRole,
  invitationId: string,
): Promise<Invitation> {
  assertValidInvitationId(invitationId);

  // Deferred error after commit — must not roll back a committed expiry write.
  let deferredError: ServiceError | undefined;
  let invitation: Invitation | undefined;

  await withTransaction(async (client) => {
    const row = await lockInvitation(client, invitationId, inviteRole);

    if (!row) {
      throw new ServiceError("NOT_FOUND", "Invitation not found.");
    }
    assertActorOwnsInvitation(actor, row);

    if (row.status === "pending" && row.expires_at <= new Date()) {
      await client.query(
        `update invitations
         set status = 'expired'
         where id = $1 and invite_role = $2 and status = 'pending'`,
        [invitationId, inviteRole],
      );
      deferredError = new ServiceError(
        "INVITATION_NOT_PENDING",
        "The invitation has expired and can no longer be revoked.",
      );
    } else if (row.status !== "pending") {
      throw new ServiceError(
        "INVITATION_NOT_PENDING",
        "The invitation is no longer pending.",
      );
    } else {
      // Defensively repeats invite_role/status even though the row above is
      // already locked and known-good — belt-and-suspenders against a
      // future refactor accidentally dropping the guard.
      const result = await client.query<InvitationRow>(
        `update invitations
         set status = 'revoked', revoked_by_user_id = $1, revoked_at = now()
         where id = $2 and invite_role = $3 and status = 'pending'
         returning ${INVITATION_COLUMNS}`,
        [actor.userId, invitationId, inviteRole],
      );
      invitation = mapInvitation(result.rows[0]);
    }
  });

  if (deferredError) {
    throw deferredError;
  }

  recordAccountEvent("account_invitation_revoked", {
    actor,
    invitationId: invitation!.id,
    inviteRole,
  });

  return invitation!;
}

// A Mentor may revoke only the Founder Invitations they sent themselves;
// an Admin may revoke any (see assertActorOwnsInvitation).
export async function revokeFounderInvitation(
  actor: ActorContext,
  invitationId: string,
): Promise<Invitation> {
  assertRole(actor, ["admin", "mentor"]);
  return revokeInvitation(actor, "founder", invitationId);
}

export async function revokeMentorInvitation(
  actor: ActorContext,
  invitationId: string,
): Promise<Invitation> {
  assertRole(actor, ["admin"]);
  return revokeInvitation(actor, "mentor", invitationId);
}
