// External, camelCase DTO returned by packages/services/src/invitation and
// consumed by apps/web. (Not apps/mcp: invitations are accepted on the
// website, and a `pending` account cannot hold an MCP token at all — see
// the founder-only allowlist in packages/services/src/mcp-auth.)
// Deliberately excludes `token_hash` —
// the raw token is only ever returned once, at creation time, alongside this
// type (see CreateFounderInvitationResult in packages/services), never as a
// field on Invitation itself.
export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export interface Invitation {
  id: string;
  email: string;
  inviteRole: "founder" | "mentor";
  workspaceId: string | null;
  status: InvitationStatus;
  invitedByUserId: string | null;
  personalMessage: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * A listed Invitation, carrying who sent it.
 *
 * Only the list reads resolve this — create/revoke/accept return a plain
 * `Invitation`, since their caller already knows who they are. It matters on
 * an Admin's screen because a Founder Invitation's sender is what decides
 * which Mentor ends up supporting them, and `invitedByUserId` alone is a UUID
 * nobody can read.
 *
 * Null for an invitation whose sender's account has since been closed.
 */
export interface InvitationListItem extends Invitation {
  invitedByName: string | null;
  invitedByEmail: string | null;
  invitedByRole: "pending" | "founder" | "mentor" | "admin" | null;
}
