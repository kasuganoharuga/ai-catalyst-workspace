import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type { AdminUserListItem, AssignableMentor } from "@ai-catalyst/shared";

import { recordAccountEvent } from "@ai-catalyst/services/audit/account-events";
import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import { parseEntityIdOrNotFound } from "@ai-catalyst/services/internal/entity-id";
import { withTransaction } from "@ai-catalyst/services/internal/transaction";
import {
  mapAdminUserRow,
  type AdminUserRow,
} from "@ai-catalyst/services/admin/internal/rows";

/**
 * Every live account on the platform for the Admin Users directory.
 * Founders include their workspace + current mentor when present.
 */
export async function listAdminUsers(
  actor: ActorContext,
): Promise<AdminUserListItem[]> {
  assertRole(actor, ["admin"]);

  const result = await pool.query<AdminUserRow>(
    `select
       u.id,
       u.email,
       u.name,
       u.role,
       u.created_at,
       w.id as workspace_id,
       w.mentor_user_id,
       m.email as mentor_email,
       m.name as mentor_name
     from users u
     left join workspaces w on w.founder_user_id = u.id and w.kind = 'live'
     left join users m on m.id = w.mentor_user_id and m.deleted_at is null
     where u.deleted_at is null
     order by u.created_at desc, u.email`,
  );

  return result.rows.map(mapAdminUserRow);
}

/** Live mentors available to bind onto a Founder workspace. */
export async function listAssignableMentors(
  actor: ActorContext,
): Promise<AssignableMentor[]> {
  assertRole(actor, ["admin"]);

  const result = await pool.query<{
    id: string;
    email: string;
    name: string;
  }>(
    `select id, email, name
     from users
     where role = 'mentor'
       and deleted_at is null
     order by email`,
  );

  return result.rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
  }));
}

/**
 * Soft-delete a user (`users.deleted_at`). Sessions are revoked by the
 * baseline trigger. Mentors are unbound from workspaces; founder workspaces
 * are archived.
 */
export async function softDeleteUser(
  actor: ActorContext,
  userId: string,
): Promise<void> {
  assertRole(actor, ["admin"]);

  const targetId = parseEntityIdOrNotFound(userId, "User not found.");

  await withTransaction(async (client) => {
    const targetResult = await client.query<{
      id: string;
      role: string;
      deleted_at: Date | null;
    }>(`select id, role, deleted_at from users where id = $1 for update`, [
      targetId,
    ]);
    const target = targetResult.rows[0];
    if (!target || target.deleted_at !== null) {
      throw new ServiceError("NOT_FOUND", "User not found.");
    }

    // Last-admin before self-delete so the sole remaining admin gets a clear
    // reason rather than the generic "cannot delete yourself" message.
    if (target.role === "admin") {
      const liveAdmins = await client.query<{ count: string }>(
        `select count(*)::text as count
         from users
         where role = 'admin'
           and deleted_at is null`,
      );
      if (Number(liveAdmins.rows[0].count) <= 1) {
        throw new ServiceError(
          "VALIDATION_ERROR",
          "Cannot delete the last admin account.",
        );
      }
    }

    if (targetId === actor.userId) {
      throw new ServiceError(
        "VALIDATION_ERROR",
        "You cannot delete your own account.",
      );
    }

    if (target.role === "mentor") {
      await client.query(
        `update workspaces
         set mentor_user_id = null, updated_at = now()
         where mentor_user_id = $1`,
        [targetId],
      );
    }

    if (target.role === "founder") {
      await client.query(
        `update workspaces
         set status = 'archived',
             archived_at = coalesce(archived_at, now()),
             updated_at = now()
         where founder_user_id = $1
           and status <> 'archived'`,
        [targetId],
      );
    }

    const deleted = await client.query(
      `update users
       set deleted_at = now(), updated_at = now()
       where id = $1
         and deleted_at is null`,
      [targetId],
    );
    if (deleted.rowCount === 0) {
      throw new ServiceError("NOT_FOUND", "User not found.");
    }
  });

  recordAccountEvent("account_soft_deleted", { actor, targetUserId: targetId });
}
