import { randomInt } from "node:crypto";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { loggerForService } from "@ai-catalyst/observability/logger";
import { SERVICE_NAMES } from "@ai-catalyst/observability/service-names";

import { recordAccountEvent } from "@ai-catalyst/services/audit/account-events";
import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import { parseEntityIdOrNotFound } from "@ai-catalyst/services/internal/entity-id";
import { revokeAllMcpConnectionsForUserId } from "@ai-catalyst/services/mcp-auth/connections";

const log = loggerForService(SERVICE_NAMES.services);

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
