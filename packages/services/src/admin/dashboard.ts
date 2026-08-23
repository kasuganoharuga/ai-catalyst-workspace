import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type { AdminDashboardStats, AdminRecentUser } from "@ai-catalyst/shared";

import { assertRole } from "@ai-catalyst/services/errors";

/**
 * Aggregate counts for the Admin dashboard. Role breakdown is live users
 * only; invitation count is still-open pending invites (not expired).
 */
export async function getAdminDashboardStats(
  actor: ActorContext,
): Promise<AdminDashboardStats> {
  assertRole(actor, ["admin"]);

  const [usersResult, coverageResult, invitationsResult, recentResult] =
    await Promise.all([
      pool.query<{
        live_users: string;
        founders: string;
        mentors: string;
        admins: string;
        pending_users: string;
        joined_this_week: string;
      }>(
        `select
           count(*)::text as live_users,
           count(*) filter (where role = 'founder')::text as founders,
           count(*) filter (where role = 'mentor')::text as mentors,
           count(*) filter (where role = 'admin')::text as admins,
           count(*) filter (where role = 'pending')::text as pending_users,
           count(*) filter (where created_at > now() - interval '7 days')::text
             as joined_this_week
         from users
         where deleted_at is null`,
      ),
      pool.query<{
        assigned_founders: string;
        unassigned_founders: string;
      }>(
        `select
           count(*) filter (where w.mentor_user_id is not null)::text
             as assigned_founders,
           count(*) filter (where w.mentor_user_id is null)::text
             as unassigned_founders
         from workspaces w
         join users u on u.id = w.founder_user_id
         where w.status = 'active'
           and u.deleted_at is null
           and u.role = 'founder'`,
      ),
      pool.query<{ pending_invitations: string }>(
        `select count(*)::text as pending_invitations
         from invitations
         where status = 'pending'
           and expires_at > now()`,
      ),
      pool.query<{
        id: string;
        name: string;
        email: string;
        role: AdminRecentUser["role"];
        created_at: Date;
      }>(
        `select id, name, email, role, created_at
         from users
         where deleted_at is null
         order by created_at desc, email
         limit 5`,
      ),
    ]);

  const users = usersResult.rows[0];
  const coverage = coverageResult.rows[0];
  return {
    liveUsers: Number(users.live_users),
    founders: Number(users.founders),
    mentors: Number(users.mentors),
    admins: Number(users.admins),
    pendingUsers: Number(users.pending_users),
    assignedFounders: Number(coverage.assigned_founders),
    unassignedFounders: Number(coverage.unassigned_founders),
    pendingInvitations: Number(invitationsResult.rows[0].pending_invitations),
    joinedThisWeek: Number(users.joined_this_week),
    recentUsers: recentResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      createdAt: row.created_at.toISOString(),
    })),
  };
}
