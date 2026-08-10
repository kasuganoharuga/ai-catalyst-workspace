// Web-facing invitation DTO (not MCP — pending accounts have no token).
// Excludes token_hash; raw token returned once at creation only.
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
 * List-only Invitation with sender display — Admin needs readable sender to match Mentor support; null if sender account closed.
 */
export interface InvitationListItem extends Invitation {
  invitedByName: string | null;
  invitedByEmail: string | null;
  invitedByRole: "pending" | "founder" | "mentor" | "admin" | null;
}
