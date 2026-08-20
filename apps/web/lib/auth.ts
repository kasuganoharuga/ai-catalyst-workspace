import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { emailOTP, mcp } from "better-auth/plugins";
import { pool } from "@ai-catalyst/db";
import { revokeAllMcpConnectionsForUserId } from "@ai-catalyst/services/mcp-auth";

import { SIGN_IN_CODE_TTL_SECONDS, signInCodeEmail } from "./auth-emails";
import { getEmailSender, isEmailDiscarded } from "./email";
import { AUTH_EMAIL_OTP_ENABLED, AUTH_GOOGLE_ENABLED } from "./feature-flags";
import { mcpOAuthSecurityPlugin } from "./mcp-oauth-compat/hooks";
import { mcpOAuthSchemaOverridePlugin } from "./mcp-oauth-compat/schema-override";
import { readTrustedProxies } from "./trusted-proxies";

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

/**
 * Google, registered only when AUTH_GOOGLE_ENABLED.
 *
 * The credentials are read inside this branch, not at module scope, so a build
 * with the flag off requires no Google env vars at all and cannot fail to boot
 * on a missing secret.
 *
 * Redirect URI to register in the Google console is
 * `${AUTH_ISSUER_URL}/api/auth/callback/google`. `baseURL` above is the same
 * value, so the usual cause of `redirect_uri_mismatch` is AUTH_ISSUER_URL not
 * matching the registered string exactly (scheme, trailing slash, apex vs www).
 */
const socialProviders = AUTH_GOOGLE_ENABLED
  ? {
      google: {
        clientId: requireEnv("GOOGLE_CLIENT_ID"),
        clientSecret: requireEnv("GOOGLE_CLIENT_SECRET"),
      },
    }
  : {};

/**
 * Sign-in by six-digit emailed code, registered only when
 * AUTH_EMAIL_OTP_ENABLED.
 *
 * A code rather than a magic link, deliberately: this sign-in page carries a
 * `returnTo` holding the MCP authorize query (see app/oauth/continue/route.ts),
 * and a link clicked in a mail client opens a fresh browser context that would
 * lose it. A code keeps the user on the page that already holds `returnTo`.
 */
function buildEmailOtpPlugin(): BetterAuthPlugin[] {
  if (!AUTH_EMAIL_OTP_ENABLED) {
    return [];
  }
  return [
    emailOTP({
      otpLength: 6,
      expiresIn: SIGN_IN_CODE_TTL_SECONDS,
      // Hashed at rest so a database read cannot yield a usable sign-in code.
      // This is a different knob from `verification.storeIdentifier` below,
      // which must stay "plain" for MCP — do not conflate the two.
      storeOTP: "hashed",
      // Matches today's public registration: an unknown address is allowed to
      // create an account, which lands at role `pending` via the
      // user.create.before hook and can do nothing until an invitation
      // upgrades it.
      disableSignUp: false,
      sendVerificationOTP: async ({ email, otp, type }) => {
        // Only the sign-in flow is wired. Email-verification / password-reset /
        // change-email variants would each need their own copy, and silently
        // sending the sign-in body for them would be misleading.
        if (type !== "sign-in") {
          throw new Error(
            `emailOTP type "${type}" has no template — only "sign-in" is supported.`,
          );
        }
        // Local development on the noop transport: the code is discarded, so
        // print it or there is no way to complete the flow. `lib/email.ts`
        // refuses to boot a real environment on noop, which is what keeps this
        // from ever logging a live code in staging or production.
        if (isEmailDiscarded()) {
          console.info(`[auth] sign-in code for ${email}: ${otp}`);
        }
        await getEmailSender().enqueue(signInCodeEmail({ to: email, otp }));
      },
    }),
  ];
}

export const auth = betterAuth({
  database: pool,
  baseURL: authIssuerUrl,
  secret: requireEnv("BETTER_AUTH_SECRET"),

  // Still enabled: the new methods land alongside it and password removal is a
  // separate, later change. While both live, note that a password-created
  // account has email_verified = false (Better Auth hardcodes it), so it
  // cannot implicitly link a Google identity on the same address — see
  // account.accountLinking below.
  emailAndPassword: {
    enabled: true,
  },

  socialProviders,

  advanced: {
    database: {
      // Postgres already defaults ids to gen_random_uuid(); explicit for clarity.
      generateId: "uuid",
    },
    ipAddress: {
      // Behind a load balancer, this is what makes rate limiting per-client
      // instead of global. Better Auth's own resolver already refuses to be
      // spoofed: with no trusted proxies it believes `X-Forwarded-For` only
      // when the header holds a single value, so anyone sending their own gets
      // `null` and lands in one shared "no-trusted-ip" bucket. Safe, but it
      // means a caller who sends the header — including a legitimate user
      // behind a corporate proxy — shares a bucket with every other such
      // caller, and the sign-in default is 3 requests per 10 seconds.
      //
      // A non-empty list switches the resolver to walking the chain from the
      // right, skipping trusted hops, which returns the real client for both
      // shapes. ALB appends the connecting address rather than replacing the
      // header (see resolveClientIp in ./mcp-oauth-compat/dcr-validation.ts),
      // so the value to configure is the network the forwarding hops sit in.
      // Empty leaves the stricter default untouched, which is what local
      // development and CI want — there is no proxy to trust there.
      trustedProxies: readTrustedProxies(),
    },
  },
  // rateLimit is left at its defaults on purpose. Better Auth enables it when
  // NODE_ENV=production — correct here, since that is exactly "a built image"
  // — and already ships stricter rules for the paths that matter: 3 requests
  // per 10s on /sign-in*, /sign-up*, /change-password*, /change-email*, and 3
  // per 60s on the password-reset and verification sends. Storage stays in
  // memory, which is per-process and cleared on deploy; that is adequate while
  // the service runs a single task, and the upgrade (`storage: "database"`)
  // needs its own table and migration.

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

    /**
     * Stated explicitly rather than inherited, because the defaults decide
     * whether one person ends up with one account or two.
     *
     * Implicit linking stays ON: it is what makes both orderings converge on a
     * single user — code-first then Google links onto the existing row (the
     * code flow marks the address verified), and Google-first then code simply
     * finds the user by email and issues a session.
     *
     * `requireLocalEmailVerified` stays at its default of true. It is the guard
     * against a classic account-takeover shape: pre-register an address you do
     * not own, wait for its real owner to arrive via Google, and inherit their
     * session. The cost of keeping it is that a password-created account
     * (email_verified = false) refuses to link Google and reports
     * "account not linked" — that refusal is the feature, not a bug to patch.
     *
     * `updateUserInfoOnLink` is left off: it overwrites the local name/image
     * from the provider on every link, which would silently undo whatever the
     * founder set in onboarding.
     */
    accountLinking: {
      enabled: true,
      requireLocalEmailVerified: true,
      updateUserInfoOnLink: false,
    },
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
          // `role` is forced on every creation path unconditionally — this is
          // the security-critical half and must never become flag-dependent. A
          // provider, or a crafted sign-up body, does not get to choose its
          // own role.
          //
          // `name` is different. Forcing it to the email is the long-standing
          // behaviour and is kept verbatim while Google is off, so enabling
          // these new methods changes nothing about the existing password
          // path. Once Google is live it supplies a real display name, and
          // discarding it just to re-ask for it in onboarding is pointless —
          // so the flag relaxes this to "default, not override". The email
          // remains the fallback either way, including for the code flow,
          // which creates users with an empty name.
          const providedName =
            typeof user.name === "string" ? user.name.trim() : "";
          const name =
            AUTH_GOOGLE_ENABLED && providedName !== ""
              ? providedName
              : user.email;
          return {
            data: {
              ...user,
              name,
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
    // Before mcp(): the schema-override plugin below rewrites the tables mcp()
    // registers, and it must sit immediately after mcp() for that to work — so
    // anything unrelated goes in front of the pair, never between them. Empty
    // array while AUTH_EMAIL_OTP_ENABLED is false.
    ...buildEmailOtpPlugin(),
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
