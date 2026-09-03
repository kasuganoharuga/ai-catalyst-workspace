import type { AdminUserListItem } from "@ai-catalyst/shared";

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  role: AdminUserListItem["role"];
  created_at: Date;
  workspace_id: string | null;
  mentor_user_id: string | null;
  mentor_email: string | null;
  mentor_name: string | null;
}

export function mapAdminUserRow(row: AdminUserRow): AdminUserListItem {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    createdAt: row.created_at.toISOString(),
    workspaceId: row.workspace_id,
    mentorUserId: row.mentor_user_id,
    mentorEmail: row.mentor_email,
    mentorName: row.mentor_name,
  };
}
