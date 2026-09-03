import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type { InvitationListItem } from "@ai-catalyst/shared";

import { assertRole } from "@ai-catalyst/services/errors";
import type { QueryExecutor } from "@ai-catalyst/services/internal/transaction";
import { withTransaction } from "@ai-catalyst/services/internal/transaction";

import {
  INVITATION_COLUMNS_QUALIFIED,
  mapInvitationListItem,
  type InvitationListRow,
  type InviteRole,
} from "@ai-catalyst/services/invitation/internal/rows";
import { expireStaleInvitations } from "@ai-catalyst/services/invitation/internal/lookups";

// Left join: closed inviter accounts still list (revocable, name optional).
async function fetchInvitationList(
  executor: QueryExecutor,
  inviteRole: InviteRole,
  scopedInviterUserId: string | null,
): Promise<InvitationListItem[]> {
  const result = await executor.query<InvitationListRow>(
    `select
       ${INVITATION_COLUMNS_QUALIFIED},
       inviter.name as invited_by_name,
       inviter.email as invited_by_email,
       inviter.role as invited_by_role
     from invitations i
     left join users inviter on inviter.id = i.invited_by_user_id
     where i.invite_role = $1
       and ($2::uuid is null or i.invited_by_user_id = $2)
     order by i.created_at desc, i.id desc`,
    [inviteRole, scopedInviterUserId],
  );
  return result.rows.map(mapInvitationListItem);
}

async function listInvitations(
  actor: ActorContext,
  inviteRole: InviteRole,
): Promise<InvitationListItem[]> {
  // Mentor list scoped in SQL — other mentors' rows never leave the database.
  const scopeToInviter = actor.role === "mentor";
  const scopedInviterUserId = scopeToInviter ? actor.userId : null;

  // Probe first — the common case has nothing to expire, so the list can
  // run as a single read statement instead of opening a write transaction
  // on every call.
  const probe = await pool.query(
    `select 1 from invitations
     where invite_role = $1 and status = 'pending' and expires_at <= now()
     limit 1`,
    [inviteRole],
  );
  if (probe.rowCount === 0) {
    return fetchInvitationList(pool, inviteRole, scopedInviterUserId);
  }

  return withTransaction(async (client) => {
    // Two statements so list sees expireStaleInvitations updates (CTE snapshot rule).
    await expireStaleInvitations(client, inviteRole);
    return fetchInvitationList(client, inviteRole, scopedInviterUserId);
  });
}

export async function listFounderInvitations(
  actor: ActorContext,
): Promise<InvitationListItem[]> {
  assertRole(actor, ["admin", "mentor"]);
  return listInvitations(actor, "founder");
}

export async function listMentorInvitations(
  actor: ActorContext,
): Promise<InvitationListItem[]> {
  assertRole(actor, ["admin"]);
  return listInvitations(actor, "mentor");
}
