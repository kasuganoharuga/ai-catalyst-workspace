/** One live user row on the Admin Users page. */
export interface AdminUserListItem {
  id: string;
  email: string;
  name: string;
  role: "pending" | "founder" | "mentor" | "admin";
  createdAt: string;
  /** Present when the user is a founder who owns a workspace. */
  workspaceId: string | null;
  mentorUserId: string | null;
  mentorEmail: string | null;
  mentorName: string | null;
}

/** Mentor option for the assign-mentor control. */
export interface AssignableMentor {
  id: string;
  email: string;
  name: string;
}

/** Recently joined account on the Admin dashboard activity list. */
export interface AdminRecentUser {
  id: string;
  name: string;
  email: string;
  role: "pending" | "founder" | "mentor" | "admin";
  createdAt: string;
}

/** Platform counts for the Admin dashboard. */
export interface AdminDashboardStats {
  liveUsers: number;
  founders: number;
  mentors: number;
  admins: number;
  pendingUsers: number;
  /** Active founder workspaces with a mentor bound. */
  assignedFounders: number;
  /** Active founder workspaces with no mentor bound. */
  unassignedFounders: number;
  /** Invitations still pending and not past expires_at. */
  pendingInvitations: number;
  /** Live users created in the last 7 days. */
  joinedThisWeek: number;
  recentUsers: AdminRecentUser[];
}
