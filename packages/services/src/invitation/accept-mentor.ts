import { createHash } from "node:crypto";

import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type { Invitation } from "@ai-catalyst/shared";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import { withTransaction } from "@ai-catalyst/services/internal/transaction";

import {
  mapInvitation,
  type InvitationRow,
} from "@ai-catalyst/services/invitation/internal/rows";
import { normalizeAndValidateInvitationToken } from "@ai-catalyst/services/invitation/internal/validate";
import { acceptPrologue } from "@ai-catalyst/services/invitation/internal/accept-prologue";

/**
 * Mentor accept — same locking as founder; no workspace/venture creation.
 */
export async function acceptMentorInvitation(
  actor: ActorContext,
  rawToken: unknown,
): Promise<{ invitation: Invitation }> {
  assertRole(actor, ["pending"]);

  const token = normalizeAndValidateInvitationToken(rawToken);
  const tokenHash = createHash("sha256").update(token).digest("hex");

  let deferredError: ServiceError | undefined;
  let invitation: Invitation | undefined;

  await withTransaction(async (client) => {
    const outcome = await acceptPrologue(client, actor, {
      tokenHash,
      inviteRole: "mentor",
      notFoundMessage: "Mentor invitation not found.",
      onWorkspaceBound: () => {
        // V1 only platform-level mentor invites — workspace-bound shape refused loudly.
        throw new ServiceError(
          "VALIDATION_ERROR",
          "Workspace-bound mentor invitations cannot be accepted yet.",
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

    const roleUpdate = await client.query(
      `update users
       set role = 'mentor'
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

    const acceptedResult = await client.query<InvitationRow>(
      `update invitations
       set status = 'accepted', invited_user_id = $1, accepted_by_user_id = $1, accepted_at = now()
       where id = $2 and invite_role = 'mentor' and status = 'pending'
       returning *`,
      [actor.userId, target.id],
    );

    // Same two-statement expiry/revoke split as founder path.
    await client.query(
      `update invitations
       set status = 'expired'
       where id <> $1
         and lower(trim(email)) = lower(trim($2))
         and status = 'pending'
         and expires_at <= now()`,
      [target.id, target.email],
    );

    await client.query(
      `update invitations
       set status = 'revoked', revoked_by_user_id = $1, revoked_at = now()
       where id <> $2
         and lower(trim(email)) = lower(trim($3))
         and status = 'pending'`,
      [actor.userId, target.id, target.email],
    );

    invitation = mapInvitation(acceptedResult.rows[0]);
  });

  if (deferredError) {
    throw deferredError;
  }
  return { invitation: invitation! };
}
