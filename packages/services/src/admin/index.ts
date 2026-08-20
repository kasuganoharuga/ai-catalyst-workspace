import { randomInt } from "node:crypto";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { loggerForService } from "@ai-catalyst/observability/logger";
import { SERVICE_NAMES } from "@ai-catalyst/observability/service-names";
import type {
  AdminDashboardStats,
  AdminRecentUser,
  AdminUserListItem,
  AssignableMentor,
} from "@ai-catalyst/shared";

import { recordAccountEvent } from "@ai-catalyst/services/audit/account-events";
import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import { parseEntityIdOrNotFound } from "@ai-catalyst/services/internal/entity-id";
import { revokeAllMcpConnectionsForUserId } from "@ai-catalyst/services/mcp-auth/connections";

const log = loggerForService(SERVICE_NAMES.services);

interface AdminUserRow {
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

function mapAdminUserRow(row: AdminUserRow): AdminUserListItem {
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
     left join workspaces w on w.founder_user_id = u.id
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

/**
 * Assign or clear the Mentor on an existing Founder workspace
 * (`workspaces.mentor_user_id`). Null clears the binding.
 */
export async function assignWorkspaceMentor(
  actor: ActorContext,
  input: { workspaceId: string; mentorUserId: string | null },
): Promise<void> {
  assertRole(actor, ["admin"]);

  const workspaceId = parseEntityIdOrNotFound(
    input.workspaceId,
    "Workspace not found.",
  );

  let mentorUserId: string | null = null;
  if (input.mentorUserId !== null) {
    mentorUserId = parseEntityIdOrNotFound(
      input.mentorUserId,
      "Mentor not found.",
    );
  }

  const client = await pool.connect();
  try {
    await client.query("begin");

    const workspaceResult = await client.query<{
      id: string;
      founder_user_id: string;
    }>(`select id, founder_user_id from workspaces where id = $1 for update`, [
      workspaceId,
    ]);
    if (workspaceResult.rowCount === 0) {
      throw new ServiceError("NOT_FOUND", "Workspace not found.");
    }

    if (mentorUserId !== null) {
      const mentorResult = await client.query<{
        id: string;
        role: string;
        deleted_at: Date | null;
      }>(`select id, role, deleted_at from users where id = $1 for update`, [
        mentorUserId,
      ]);
      const mentor = mentorResult.rows[0];
      if (!mentor || mentor.deleted_at !== null || mentor.role !== "mentor") {
        throw new ServiceError("NOT_FOUND", "Mentor not found.");
      }

      if (mentor.id === workspaceResult.rows[0].founder_user_id) {
        throw new ServiceError(
          "VALIDATION_ERROR",
          "A founder cannot be their own mentor.",
        );
      }
    }

    await client.query(
      `update workspaces
       set mentor_user_id = $1, updated_at = now()
       where id = $2`,
      [mentorUserId, workspaceId],
    );

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  // Outside the transaction: a committed change that failed to log is better
  // than a logged change that rolled back.
  recordAccountEvent("account_workspace_mentor_changed", {
    actor,
    workspaceId,
    mentorUserId,
  });
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

  const client = await pool.connect();
  try {
    await client.query("begin");

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

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  recordAccountEvent("account_soft_deleted", { actor, targetUserId: targetId });
}

// --- Break-glass password recovery ---

/**
 * Unambiguous characters only — no `0`/`O`, no `1`/`l`/`I`. This password is
 * read off one screen and retyped on another, usually after being pasted into
 * a chat message, so a character that survives that trip matters more than a
 * larger alphabet.
 */
const TEMPORARY_PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const TEMPORARY_PASSWORD_LENGTH = 16;

/**
 * ~79 bits over the alphabet above. `randomInt` rather than `randomBytes()[i] %
 * length`, which biases toward the front of a 31-character alphabet.
 *
 * Exported so the account-creation script hands out passwords of the same shape
 * as an admin reset — one generator, so "what does a temporary password look
 * like" has a single answer.
 */
export function generateTemporaryPassword(): string {
  let password = "";
  for (let index = 0; index < TEMPORARY_PASSWORD_LENGTH; index += 1) {
    password +=
      TEMPORARY_PASSWORD_ALPHABET[
        randomInt(TEMPORARY_PASSWORD_ALPHABET.length)
      ];
  }
  return password;
}

export interface AdminPasswordResetResult {
  /** Echoed back so the caller can name the account it just reset. */
  email: string;
  /** Plaintext, returned exactly once. Never stored, never logged. */
  temporaryPassword: string;
}

export interface ResetUserPasswordInput {
  userId: string;
  /**
   * Persists `plainTextPassword` as this user's new credential password.
   *
   * Injected because hashing belongs to Better Auth and `packages/services`
   * must not depend on the auth framework (`packages-cannot-import-apps` in
   * .dependency-cruiser.js is the same instinct one layer up). apps/web passes
   * the adapter call Better Auth's own reset-password route uses, which is
   * what keeps the hash format right — see `resetUserPasswordAction`.
   */
  writePassword: (userId: string, plainTextPassword: string) => Promise<void>;
}

/**
 * Resets another user's password to a fresh temporary one and returns it.
 *
 * This exists because there is no self-serve reset: `sendResetPassword` is
 * unconfigured while email delivery is still unavailable (see
 * apps/web/lib/email.ts), so a founder who forgets their password currently has
 * no route back into the product at all. Delivery is deliberately manual — the
 * temporary password goes to the admin, once, to pass on out of band, exactly
 * like the one-time code from `createFounderInvitation`.
 *
 * Retire this in favour of the real reset flow once mail is live; until then it
 * is the only recovery path, and the alternative is editing `accounts` by hand
 * against production.
 *
 * Authorisation, the target checks, and revoking everything the old password
 * still reaches all live here rather than in the caller, so that no call site
 * can perform half a reset.
 */
export async function resetUserPassword(
  actor: ActorContext,
  input: ResetUserPasswordInput,
): Promise<AdminPasswordResetResult> {
  assertRole(actor, ["admin"]);

  const targetId = parseEntityIdOrNotFound(input.userId, "User not found.");

  // Not a safety rail so much as a signpost: an admin resetting their own
  // password wants Account security, which asks for the current one and does
  // not hand back a temporary password to copy.
  if (targetId === actor.userId) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "Use Account security to change your own password.",
    );
  }

  const targetResult = await pool.query<{
    email: string;
    has_password: boolean;
  }>(
    `select u.email,
            exists (
              select 1
              from accounts a
              where a.user_id = u.id
                and a.provider_id = 'credential'
            ) as has_password
     from users u
     where u.id = $1
       and u.deleted_at is null`,
    [targetId],
  );
  const target = targetResult.rows[0];
  if (!target) {
    throw new ServiceError("NOT_FOUND", "User not found.");
  }

  // A social-only account has no password row to overwrite. Better Auth's
  // updatePassword would find nothing and report success, leaving an admin
  // holding a temporary password that can never sign in.
  if (!target.has_password) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "This account has no password sign-in to reset.",
    );
  }

  const temporaryPassword = generateTemporaryPassword();
  await input.writePassword(targetId, temporaryPassword);

  // Revoked after the write, not before. Revoking first would sign the user
  // out and then — if the write failed — leave the old password working: a
  // reset that reports success and changed nothing. This ordering fails the
  // other way instead, on a password that *has* changed while old access may
  // survive, which is a state the admin can see and fix by resetting again.
  try {
    await pool.query(`delete from sessions where user_id = $1`, [targetId]);
    await revokeAllMcpConnectionsForUserId(targetId);
  } catch (error) {
    // The message below is all the admin gets; without this the root cause of
    // a half-completed reset would be lost entirely.
    log.error({
      event: "admin_password_reset_revocation_failed",
      message:
        "Password was reset but sessions/MCP grants could not be revoked",
      target_user_id: targetId,
      actor_user_id: actor.userId,
      error_name: error instanceof Error ? error.name : "unknown",
    });
    throw new ServiceError(
      "INTERNAL_INVARIANT_ERROR",
      "The password was reset, but existing sessions could not be revoked. Reset again.",
    );
  }

  // Only after the revocations: this line means a complete reset, so that a
  // reader can treat its absence as "this account was left half-reset".
  recordAccountEvent("account_password_reset_by_admin", {
    actor,
    targetUserId: targetId,
  });

  return { email: target.email, temporaryPassword };
}
