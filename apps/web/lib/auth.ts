import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { pool } from "@ai-catalyst/db";

/**
 * Better Auth is the Authorization Server for the platform (architecture.mdc
 * rule 4). It owns users/sessions/accounts/verifications, mapped onto the
 * exact snake_case schema in
 * infra/database/migrations/0001_aidb_v5_baseline.sql.
 *
 * Registration is temporarily public (see the `pending` role default below
 * and apps/web/lib/require-active-user.ts) until invitation-gated
 * registration lands — see README.md's "Temporary: public registration"
 * note for the full rationale.
 */
export const auth = betterAuth({
  database: pool,
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,

  emailAndPassword: {
    enabled: true,
  },

  advanced: {
    database: {
      // The schema's `id uuid primary key default gen_random_uuid()`
      // already lets Postgres generate the value; setting this explicitly
      // documents that as an intentional choice rather than an default.
      generateId: "uuid",
    },
  },

  user: {
    modelName: "users",
    fields: {
      emailVerified: "email_verified",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
    additionalFields: {
      // `role` is never client-settable (`input: false`) — it starts at
      // 'pending' and is only ever upgraded server-side, inside the
      // invitation-acceptance transaction (packages/services/src/invitation).
      role: {
        type: "string",
        input: false,
        defaultValue: "pending",
      },
    },
  },

  session: {
    modelName: "sessions",
    fields: {
      userId: "user_id",
      expiresAt: "expires_at",
      ipAddress: "ip_address",
      userAgent: "user_agent",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },

  account: {
    modelName: "accounts",
    fields: {
      userId: "user_id",
      accountId: "account_id",
      providerId: "provider_id",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      idToken: "id_token",
      accessTokenExpiresAt: "access_token_expires_at",
      refreshTokenExpiresAt: "refresh_token_expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
    // Required by infra/database/migrations/0001_aidb_v5_baseline.sql's
    // section-1 comment: OAuth tokens must never be stored in plaintext.
    encryptOAuthTokens: true,
  },

  verification: {
    modelName: "verifications",
    fields: {
      expiresAt: "expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },

  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          // Force-normalize regardless of client input: `name` always
          // starts equal to `email` (per the schema comment), and `role`
          // always starts 'pending' even though additionalFields.input:
          // false already blocks it from the public signup payload — this
          // is a defense-in-depth backstop against any other creation path
          // (e.g. OAuth implicit signup) reaching this hook.
          return {
            data: {
              ...user,
              name: user.email,
              role: "pending",
            },
          };
        },
      },
    },
  },

  // Must stay last: lets server actions (e.g. the /login and /register
  // forms) set the session cookie automatically.
  plugins: [nextCookies()],
});
