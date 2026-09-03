import type { PoolClient } from "pg";

import type { ActorContext } from "@ai-catalyst/contracts/actor-context";

import { ServiceError } from "@ai-catalyst/services/errors";

import {
  INVITATION_COLUMNS,
  type InvitationRow,
  type InviteRole,
} from "@ai-catalyst/services/invitation/internal/rows";

// Expire stale pending rows before every mutating/list op.
export async function expireStaleInvitations(
  client: PoolClient,
  inviteRole: InviteRole,
  email?: string,
): Promise<void> {
  await client.query(
    `update invitations
     set status = 'expired', updated_at = now()
     where invite_role = $1
       and status = 'pending'
       and expires_at <= now()
       and ($2::text is null or lower(trim(email)) = lower(trim($2)))`,
    [inviteRole, email ?? null],
  );
}

export async function lockInvitation(
  client: PoolClient,
  invitationId: string,
  inviteRole: InviteRole,
): Promise<InvitationRow | undefined> {
  const result = await client.query<InvitationRow>(
    `select ${INVITATION_COLUMNS} from invitations
     where id = $1 and invite_role = $2
     for update`,
    [invitationId, inviteRole],
  );
  return result.rows[0];
}

// Mentor scoped to own invitations; admin unscoped. NOT_FOUND not FORBIDDEN — no enumeration oracle.
export function assertActorOwnsInvitation(
  actor: ActorContext,
  row: InvitationRow,
): void {
  if (actor.role === "mentor" && row.invited_by_user_id !== actor.userId) {
    throw new ServiceError("NOT_FOUND", "Invitation not found.");
  }
}
