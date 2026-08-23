import type { PoolClient } from "pg";

import type { ActorContext } from "@ai-catalyst/contracts/actor-context";

import { ServiceError } from "@ai-catalyst/services/errors";

import {
  INVITATION_COLUMNS,
  type InvitationRow,
  type InviteRole,
  type UserRow,
} from "@ai-catalyst/services/invitation/internal/rows";
import { normalizeEmail } from "@ai-catalyst/services/invitation/internal/validate";

export interface AcceptPrologueOptions {
  tokenHash: string;
  inviteRole: InviteRole;
  notFoundMessage: string;
  // Founder invitations must have null workspace_id — corruption trip wire,
  // so that path throws a bare Error (500). A workspace-bound mentor
  // invitation is a legal-but-unsupported shape, so that path throws a
  // ServiceError("VALIDATION_ERROR") (400). Parameterized rather than
  // unified because the two roles need different error identities here.
  onWorkspaceBound: (target: InvitationRow) => never;
}

export type AcceptPrologueOutcome =
  { target: InvitationRow; user: UserRow } | { expired: true };

/**
 * Shared lock/validate prologue for acceptFounderInvitation and
 * acceptMentorInvitation. Runs inside the caller's transaction and returns
 * the locked target invitation and locked user row, ready for the
 * caller's role-specific mutations (role upgrade, workspace/venture
 * creation, sibling housekeeping) — it deliberately stops before those,
 * since they differ by role.
 *
 * On an expired invitation, the deferred-expiry write is committed here but
 * `{ expired: true }` is returned rather than thrown — the caller must set
 * a deferredError and throw only after its withTransaction call resolves,
 * or the commit itself gets rolled back.
 */
export async function acceptPrologue(
  client: PoolClient,
  actor: ActorContext,
  options: AcceptPrologueOptions,
): Promise<AcceptPrologueOutcome> {
  const { tokenHash, inviteRole, notFoundMessage, onWorkspaceBound } = options;

  // Unlocked peek for email; invite_role filter blocks the other role's tokens here.
  const peeked = await client.query<{ id: string; email: string }>(
    `select id, email from invitations
     where token_hash = $1 and invite_role = $2`,
    [tokenHash, inviteRole],
  );
  const peekedInvitation = peeked.rows[0];
  if (!peekedInvitation) {
    throw new ServiceError("NOT_FOUND", notFoundMessage);
  }

  // Lock full email family by id order — stable lock order prevents deadlocks.
  const familyResult = await client.query<InvitationRow>(
    `select ${INVITATION_COLUMNS} from invitations
     where lower(trim(email)) = lower(trim($1))
     order by id
     for update`,
    [peekedInvitation.email],
  );

  // Re-find target in locked set — guards invariant if peek ever diverged.
  const target = familyResult.rows.find(
    (row) =>
      row.id === peekedInvitation.id &&
      row.token_hash === tokenHash &&
      row.invite_role === inviteRole,
  );
  if (!target) {
    throw new ServiceError("NOT_FOUND", notFoundMessage);
  }

  if (target.workspace_id !== null) {
    onWorkspaceBound(target);
  }

  if (target.status !== "pending") {
    throw new ServiceError(
      "INVITATION_NOT_PENDING",
      "The invitation is no longer pending.",
    );
  }

  if (target.expires_at <= new Date()) {
    await client.query(
      `update invitations
       set status = 'expired'
       where id = $1 and invite_role = $2 and status = 'pending'`,
      [target.id, inviteRole],
    );
    return { expired: true };
  }

  const userResult = await client.query<UserRow>(
    `select id, email, role, deleted_at from users where id = $1 for update`,
    [actor.userId],
  );
  const user = userResult.rows[0];

  if (!user || user.deleted_at !== null || user.role !== "pending") {
    throw new ServiceError(
      "FORBIDDEN",
      "Only an account awaiting invitation acceptance can accept this invitation.",
    );
  }

  if (normalizeEmail(user.email) !== normalizeEmail(target.email)) {
    throw new ServiceError(
      "INVITATION_EMAIL_MISMATCH",
      "This invitation was issued to a different email address.",
    );
  }

  return { target, user };
}
