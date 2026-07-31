import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { mcp } from "better-auth/plugins";
import { pool } from "@ai-catalyst/db";
import { revokeAllMcpConnectionsForUserId } from "@ai-catalyst/services/mcp-auth";

import { mcpOAuthSecurityPlugin } from "./mcp-oauth-compat/hooks";
import { mcpOAuthSchemaOverridePlugin } from "./mcp-oauth-compat/schema-override";

/**
 * Better Auth is the platform Authorization Server (users, sessions, MCP OAuth).
 *
 * Registration is temporarily public (see the `pending` role default below
 * and apps/web/lib/require-active-user.ts) until invitation-gated
 * registration lands — see README.md's "Temporary: public registration"
 * note for the full rationale.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

// The OAuth "issuer" — apps/web's own base URL. Named to match the OAuth/
// OIDC spec term (and apps/mcp's identically-purposed env var) rather than
// Better Auth's own generic `BETTER_AUTH_URL` convention, since this value
// is load-bearing for the MCP Authorization Server role specifically (it's
// what apps/mcp's protected-resource metadata points MCP clients back to —
// see apps/mcp/src/well-known/protected-resource.ts).
const authIssuerUrl = requireEnv("AUTH_ISSUER_URL");

export const auth = betterAuth({
  database: pool,
  baseURL: authIssuerUrl,
  secret: requireEnv("BETTER_AUTH_SECRET"),

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
    // Cross-layer contract, pinned explicitly rather than relying on the
    // (currently matching) default: packages/services/src/mcp-auth's
    // getPendingMcpConsentRequest and checkAuthorizationCodeIsRedeemable
    // both query `verifications.identifier` directly via packages/db,
    // bypassing Better Auth's own storage adapter — which only works if
    // the identifier Better Auth stores is the exact plain consent_code /
    // code it handed to the client. If this is ever changed to "hashed",
    // every one of those lookups silently starts missing every real code.
    // See apps/web/lib/mcp-oauth-compat/README.md.
    storeIdentifier: "plain",
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

    account: {
      update: {
        // Password change/reset must revoke MCP grants (sessions alone are not enough).
        after: async (account, context) => {
          if (
            context?.path !== "/change-password" &&
            context?.path !== "/reset-password"
          ) {
            return;
          }
          if (account.providerId !== "credential" || !account.userId) {
            return;
          }

          try {
            await revokeAllMcpConnectionsForUserId(account.userId);
          } catch (error) {
            // Don't fail the password change; password-section also revokes.
            console.error(
              "Failed to revoke MCP connections after password change:",
              error,
            );
          }
        },
      },
    },
  },

  plugins: [
    // OAuth 2.1 Authorization Server for MCP. apps/mcp verifies Bearer tokens
    // issued here — see packages/services/src/mcp-auth.
    mcp({
      // Route Handler: preserves authorize query across sign-in (see /oauth/continue).
      loginPage: "/oauth/continue",
      oidcConfig: {
        // Required by OIDCOptions even though mcp() already sets opts.loginPage.
        loginPage: "/oauth/continue",
        // offline_access is added by the authorize before-hook, not listed here.
        scopes: ["mcp:connect"],
        defaultScope: "mcp:connect",
        requirePKCE: true,
        allowPlainCodeChallengeMethod: false,
        allowDynamicClientRegistration: true,
        consentPage: "/oauth/consent",
        codeExpiresIn: 600,
        // Short-lived bearer; connection lifetime is idle/absolute in mcp-auth.
        accessTokenExpiresIn: 3600,
        // Sliding 30d ceiling; real limits are idle 14d / absolute 90d in mcp-auth.
        refreshTokenExpiresIn: 2_592_000,
      },
    }),
    // Must come after mcp() in this array — see that file's top-of-file
    // comment for why table/field renaming for the mcp() plugin's schema
    // can only be applied this way in better-auth@1.6.25.
    mcpOAuthSchemaOverridePlugin,
    // Every before-hook that hardens the mcp()/oidc-provider endpoints
    // above — see apps/web/lib/mcp-oauth-compat/README.md.
    mcpOAuthSecurityPlugin,
    // Must stay last: lets server actions (e.g. the /login and /register
    // forms) set the session cookie automatically.
    nextCookies(),
  ],
});
