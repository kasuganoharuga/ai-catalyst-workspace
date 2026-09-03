import { pool } from "@ai-catalyst/db";
import { ServiceError } from "@ai-catalyst/services/errors";

import { auth } from "@/lib/auth";

/**
 * Creates a password account without issuing a session.
 *
 * `auth.api.signUpEmail` is the public register path and, through
 * nextCookies(), would replace the inviter's session cookie with the new
 * user's. The internal adapter writes the same rows the sign-up hook would
 * (role forced to `pending`, name forced to email) without touching cookies.
 */
export async function createInvitedCredentialUser(
  email: string,
  password: string,
): Promise<string> {
  const existing = await pool.query<{ id: string }>(
    `select id from users where lower(email) = lower($1) limit 1`,
    [email],
  );
  if (existing.rows[0]) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "An account already exists for this email.",
    );
  }

  const authContext = await auth.$context;
  const user = await authContext.internalAdapter.createUser({
    email,
    name: email,
    emailVerified: true,
  });
  if (!user?.id) {
    throw new ServiceError(
      "INTERNAL_INVARIANT_ERROR",
      "Sign-up did not create a user.",
    );
  }

  try {
    await authContext.internalAdapter.createAccount({
      userId: user.id,
      accountId: user.id,
      providerId: "credential",
      password: await authContext.password.hash(password),
    });
  } catch (error) {
    await deleteProvisionedUser(user.id);
    throw error;
  }

  return user.id;
}

export async function deleteProvisionedUser(userId: string): Promise<void> {
  await pool.query(`delete from accounts where user_id = $1`, [userId]);
  await pool.query(`delete from users where id = $1`, [userId]);
}
