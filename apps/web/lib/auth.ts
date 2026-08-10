import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { mcp } from "better-auth/plugins";
import { pool } from "@ai-catalyst/db";
import { revokeAllMcpConnectionsForUserId } from "@ai-catalyst/services/mcp-auth";

import { mcpOAuthSecurityPlugin } from "./mcp-oauth-compat/hooks";
import { mcpOAuthSchemaOverridePlugin } from "./mcp-oauth-compat/schema-override";

/**
 * Better Auth: platform Authorization Server (users, sessions, MCP OAuth).
 * Registration is temporarily public — new accounts start at role `pending` until invitation acceptance.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

// OAuth issuer — apps/web base URL; MCP protected-resource metadata points clients here.
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
      // Postgres already defaults ids to gen_random_uuid(); explicit for clarity.
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
      // Never client-settable — starts `pending`, upgraded only in invitation acceptance.
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
    // OAuth tokens must never be stored in plaintext (see migration baseline).
    encryptOAuthTokens: true,
  },

  verification: {
    modelName: "verifications",
    fields: {
      expiresAt: "expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
    // Must stay `plain` — mcp-auth lookups query identifier directly; hashing would break consent/code redemption.
    storeIdentifier: "plain",
  },

  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          // Defense in depth: name = email, role = pending on every creation path.
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
    // OAuth 2.1 Authorization Server for MCP; apps/mcp verifies Bearer tokens issued here.
    mcp({
      // Preserves authorize query across sign-in (see /oauth/continue).
      loginPage: "/oauth/continue",
      oidcConfig: {
        loginPage: "/oauth/continue",
        // offline_access added by authorize before-hook, not listed here.
        scopes: ["mcp:connect"],
        defaultScope: "mcp:connect",
        requirePKCE: true,
        allowPlainCodeChallengeMethod: false,
        allowDynamicClientRegistration: true,
        consentPage: "/oauth/consent",
        codeExpiresIn: 600,
        accessTokenExpiresIn: 3600,
        refreshTokenExpiresIn: 2_592_000,
      },
    }),
    // Must follow mcp() — schema override only works after mcp() registers tables (better-auth@1.6.25).
    mcpOAuthSchemaOverridePlugin,
    // Hardens mcp()/oidc endpoints — see mcp-oauth-compat/README.md.
    mcpOAuthSecurityPlugin,
    // Must stay last so server actions set the session cookie automatically.
    nextCookies(),
  ],
});
