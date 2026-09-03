import type {
  Invitation,
  InvitationListItem,
  InvitationStatus,
} from "@ai-catalyst/shared";

export type InviteRole = "founder" | "mentor";

export interface InvitationRow {
  id: string;
  email: string;
  invite_role: "founder" | "mentor";
  workspace_id: string | null;
  token_hash: string;
  invited_by_user_id: string | null;
  invited_user_id: string | null;
  status: InvitationStatus;
  personal_message: string | null;
  expires_at: Date;
  accepted_by_user_id: string | null;
  accepted_at: Date | null;
  revoked_by_user_id: string | null;
  revoked_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// Explicit column list — never `select *` — matching InvitationRow above.
// The table also has last_sent_at/send_count, which nothing here reads.
export const INVITATION_COLUMNS = `
  id, email, invite_role, workspace_id, token_hash, invited_by_user_id,
  invited_user_id, status, personal_message, expires_at,
  accepted_by_user_id, accepted_at, revoked_by_user_id, revoked_at,
  created_at, updated_at
`
  .trim()
  .replace(/\s+/g, " ");

// Same list, qualified for the "i" alias used by listInvitations' join.
export const INVITATION_COLUMNS_QUALIFIED = INVITATION_COLUMNS.split(", ")
  .map((column) => `i.${column}`)
  .join(", ");

export interface UserRow {
  id: string;
  email: string;
  role: "pending" | "founder" | "mentor" | "admin";
  deleted_at: Date | null;
}

export function mapInvitation(row: InvitationRow): Invitation {
  return {
    id: row.id,
    email: row.email,
    inviteRole: row.invite_role,
    workspaceId: row.workspace_id,
    status: row.status,
    invitedByUserId: row.invited_by_user_id,
    personalMessage: row.personal_message,
    expiresAt: row.expires_at.toISOString(),
    acceptedAt: row.accepted_at?.toISOString() ?? null,
    revokedAt: row.revoked_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export interface InvitationListRow extends InvitationRow {
  invited_by_name: string | null;
  invited_by_email: string | null;
  invited_by_role: UserRow["role"] | null;
}

export function mapInvitationListItem(
  row: InvitationListRow,
): InvitationListItem {
  return {
    ...mapInvitation(row),
    invitedByName: row.invited_by_name,
    invitedByEmail: row.invited_by_email,
    invitedByRole: row.invited_by_role,
  };
}
