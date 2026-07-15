// External, camelCase DTO returned by packages/services/src/invitation and
// consumed by apps/web and apps/mcp. Deliberately excludes `token_hash` —
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
