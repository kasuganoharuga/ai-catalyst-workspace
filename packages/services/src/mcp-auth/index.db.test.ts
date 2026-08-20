import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pool } from "@ai-catalyst/db";
import { createWebActorContext } from "@ai-catalyst/contracts/actor-context";

import { ServiceError } from "../errors.js";
import {
  checkAuthorizationCodeIsRedeemable,
  checkRefreshTokenIsRedeemable,
  clampMcpRefreshTokenExpiryToGrant,
  cleanupExpiredMcpOAuthState,
  getAuthorizableUserById,
  getMcpConnectionStatus,
  getOAuthClientByClientId,
  getPendingMcpConsentRequest,
  isValidPublicOAuthClientRecord,
  mcpProviderForRedirectUris,
  recordMcpGrantIssued,
  revokeMcpAccessToken,
  revokeMcpConnectionForUser,
  rotateOutMcpRefreshToken,
  tryClaimConsentCode,
  tryClaimRefreshToken,
  verifyMcpBearerToken,
} from "./index.js";

/**
 * Integration tests against the real Postgres database (see
 * apps/web/tests/README.md for prerequisites). Named `*.db.test.ts` so
 * `pnpm test` skips it and `pnpm test:db` runs it.
 */
describe("mcp-auth service — database integration", () => {
  const idPrefix = `mcp-auth-test-${randomUUID()}`;
  const createdUserIds: string[] = [];
  const createdClientIds: string[] = [];
  const createdVerificationIdentifiers: string[] = [];
  const createdConsentClaimHashes: string[] = [];
  const createdRefreshClaimHashes: string[] = [];

  const ALPHA = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const ALPHANUMERIC = `${ALPHA}0123456789`;

  function randomFromAlphabet(alphabet: string, length: number): string {
    const bytes = randomBytes(length);
    return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  }

  function newAccessToken(): string {
    return randomFromAlphabet(ALPHA, 32);
  }

  function newConsentCode(): string {
    return randomFromAlphabet(ALPHANUMERIC, 32);
  }

  async function createUser(
    label: string,
    role: "pending" | "founder" | "mentor" | "admin",
    options: { deleted?: boolean } = {},
  ): Promise<string> {
    const email = `${idPrefix}-${label}@example.com`;
    const result = await pool.query<{ id: string }>(
      `insert into users (name, email, role, deleted_at)
       values ($1, $2, $3, $4)
       returning id`,
      [email, email, role, options.deleted ? new Date() : null],
    );
    const id = result.rows[0].id;
    createdUserIds.push(id);
    return id;
  }

  async function createClient(
    label: string,
    options: {
      disabled?: boolean;
      type?: string;
      clientSecret?: string | null;
      redirectUrls?: string;
    } = {},
  ): Promise<string> {
    const clientId = `${idPrefix}-client-${label}`;
    await pool.query(
      `insert into mcp_oauth_applications
         (name, client_id, client_secret, redirect_urls, type, disabled)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        `Test Client ${label}`,
        clientId,
        options.clientSecret ?? null,
        options.redirectUrls ?? "https://claude.ai/callback",
        options.type ?? "public",
        options.disabled ?? false,
      ],
    );
    createdClientIds.push(clientId);
    return clientId;
  }

  // `expired` expires only the access token — which on its own is a normal,
  // healthy state now that the refresh token can mint a new one. Use
  // `refreshExpired` as well to model a connection that is genuinely over.
  async function createAccessToken(
    clientId: string,
    userId: string | null,
    options: {
      expired?: boolean;
      refreshExpired?: boolean;
      scopes?: string;
    } = {},
  ): Promise<string> {
    const accessToken = newAccessToken();
    const refreshToken = newAccessToken();
    const expiresAt = options.expired
      ? new Date(Date.now() - 60_000)
      : new Date(Date.now() + 3_600_000);
    const refreshExpiresAt = options.refreshExpired
      ? new Date(Date.now() - 60_000)
      : new Date(Date.now() + 30 * 24 * 3_600_000);

    await pool.query(
      `insert into mcp_oauth_access_tokens
         (access_token, refresh_token, access_token_expires_at, refresh_token_expires_at, client_id, user_id, scopes)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        accessToken,
        refreshToken,
        expiresAt,
        refreshExpiresAt,
        clientId,
        userId,
        options.scopes ?? "mcp:connect offline_access",
      ],
    );
    return accessToken;
  }

  // The refresh-token half of the same row, for tests that need to redeem it.
  async function getRefreshTokenFor(accessToken: string): Promise<string> {
    const result = await pool.query<{ refresh_token: string }>(
      "select refresh_token from mcp_oauth_access_tokens where access_token = $1",
      [accessToken],
    );
    return result.rows[0].refresh_token;
  }

  async function createVerification(
    value: object,
    options: { expired?: boolean } = {},
  ): Promise<string> {
    const identifier = newConsentCode();
    await pool.query(
      `insert into verifications (identifier, value, expires_at)
       values ($1, $2, $3)`,
      [
        identifier,
        JSON.stringify(value),
        options.expired
          ? new Date(Date.now() - 60_000)
          : new Date(Date.now() + 600_000),
      ],
    );
    createdVerificationIdentifiers.push(identifier);
    return identifier;
  }

  // Mirrors what apps/mcp's audit wrapper writes on every tool call.
  // `created_at` is set explicitly so a test can place activity at a
  // chosen distance in the past.
  async function insertAuditLog(
    userId: string,
    options: { minutesAgo?: number; outcome?: string } = {},
  ): Promise<void> {
    await pool.query(
      `insert into mcp_tool_audit_logs
         (request_id, user_id, provider, tool_name, outcome, created_at)
       values ($1, $2, 'claude', 'list_modules', $3, now() - ($4 * interval '1 minute'))`,
      [
        `${idPrefix}-req-${randomUUID()}`,
        userId,
        options.outcome ?? "success",
        options.minutesAgo ?? 0,
      ],
    );
  }

  function hashConsentCodeForCleanup(consentCode: string): string {
    return createHash("sha256").update(consentCode, "utf8").digest("hex");
  }

  function createPkcePair(): { codeVerifier: string; codeChallenge: string } {
    const codeVerifier = randomFromAlphabet(ALPHANUMERIC, 64);
    const codeChallenge = createHash("sha256")
      .update(codeVerifier, "utf8")
      .digest("base64url");
    return { codeVerifier, codeChallenge };
  }

  // Grant rows are what carry `granted_at` across rotation, so a test that
  // needs a connection of a particular age writes one directly.
  async function createGrant(
    userId: string,
    clientId: string,
    options: { daysAgo?: number } = {},
  ): Promise<void> {
    await pool.query(
      `insert into mcp_oauth_grants (user_id, client_id, granted_at)
       values ($1, $2, now() - ($3 * interval '1 day'))
       on conflict (user_id, client_id)
       do update set granted_at = excluded.granted_at`,
      [userId, clientId, options.daysAgo ?? 0],
    );
  }

  async function getGrantedAt(
    userId: string,
    clientId: string,
  ): Promise<Date | null> {
    const result = await pool.query<{ granted_at: Date }>(
      "select granted_at from mcp_oauth_grants where user_id = $1 and client_id = $2",
      [userId, clientId],
    );
    return result.rows[0]?.granted_at ?? null;
  }

  afterAll(async () => {
    await pool.query(
      "delete from mcp_tool_audit_logs where user_id = any($1::uuid[])",
      [createdUserIds],
    );
    await pool.query(
      "delete from mcp_oauth_grants where client_id = any($1::text[])",
      [createdClientIds],
    );
    await pool.query(
      "delete from mcp_oauth_access_tokens where client_id = any($1::text[])",
      [createdClientIds],
    );
    await pool.query(
      "delete from mcp_oauth_consents where client_id = any($1::text[])",
      [createdClientIds],
    );
    await pool.query(
      "delete from mcp_oauth_applications where client_id = any($1::text[])",
      [createdClientIds],
    );
    if (createdVerificationIdentifiers.length > 0) {
      await pool.query(
        "delete from verifications where identifier = any($1::text[])",
        [createdVerificationIdentifiers],
      );
    }
    if (createdConsentClaimHashes.length > 0) {
      await pool.query(
        "delete from mcp_oauth_consent_claims where consent_code_hash = any($1::text[])",
        [createdConsentClaimHashes],
      );
    }
    if (createdRefreshClaimHashes.length > 0) {
      await pool.query(
        "delete from mcp_oauth_refresh_claims where refresh_token_hash = any($1::text[])",
        [createdRefreshClaimHashes],
      );
    }
    await pool.query("delete from users where id = any($1::uuid[])", [
      createdUserIds,
    ]);
  });

  describe("verifyMcpBearerToken", () => {
    it("returns a valid MCP ActorContext for a valid token", async () => {
      const userId = await createUser("valid", "founder");
      const clientId = await createClient("valid");
      const token = await createAccessToken(clientId, userId);

      const actor = await verifyMcpBearerToken(token);

      expect(actor).toMatchObject({
        userId,
        role: "founder",
        source: "mcp",
        clientId,
        scopes: ["mcp:connect", "offline_access"],
      });
    });

    it("rejects a malformed token without querying the database", async () => {
      await expect(
        verifyMcpBearerToken("not-a-real-token"),
      ).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
      });
    });

    it("rejects an unknown token", async () => {
      await expect(
        verifyMcpBearerToken(newAccessToken()),
      ).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
      });
    });

    it("rejects an expired token", async () => {
      const userId = await createUser("expired", "founder");
      const clientId = await createClient("expired");
      const token = await createAccessToken(clientId, userId, {
        expired: true,
      });

      await expect(verifyMcpBearerToken(token)).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
      });
    });

    it("rejects a token whose client is disabled", async () => {
      const userId = await createUser("disabled-client", "founder");
      const clientId = await createClient("disabled-client", {
        disabled: true,
      });
      const token = await createAccessToken(clientId, userId);

      await expect(verifyMcpBearerToken(token)).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
      });
    });

    it("rejects a token whose client is confidential (not public)", async () => {
      const userId = await createUser("confidential-client", "founder");
      const clientId = await createClient("confidential", {
        type: "web",
        clientSecret: "some-secret",
      });
      const token = await createAccessToken(clientId, userId);

      await expect(verifyMcpBearerToken(token)).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
      });
    });

    it("rejects a token for a deleted user", async () => {
      const userId = await createUser("deleted", "founder", { deleted: true });
      const clientId = await createClient("deleted-user");
      const token = await createAccessToken(clientId, userId);

      await expect(verifyMcpBearerToken(token)).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
      });
    });

    it("rejects with FORBIDDEN for a pending user (valid subject, not authorized)", async () => {
      const userId = await createUser("pending", "pending");
      const clientId = await createClient("pending-user");
      const token = await createAccessToken(clientId, userId);

      await expect(verifyMcpBearerToken(token)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("rejects with FORBIDDEN when the token is missing the mcp:connect scope", async () => {
      const userId = await createUser("insufficient-scope", "founder");
      const clientId = await createClient("insufficient-scope");
      const token = await createAccessToken(clientId, userId, { scopes: "" });

      await expect(verifyMcpBearerToken(token)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    // Every tool behind this transport is Founder-scoped, so a Mentor or
    // Admin token is turned away at the boundary rather than collecting a
    // FORBIDDEN from each individual tool call. Mentors supervise through
    // apps/web; Admins do no project work.
    it.each(["mentor", "admin"] as const)(
      "rejects with FORBIDDEN for a %s token",
      async (role) => {
        const userId = await createUser(`mcp-role-${role}`, role);
        const clientId = await createClient(`mcp-role-${role}`);
        const token = await createAccessToken(clientId, userId);

        await expect(verifyMcpBearerToken(token)).rejects.toMatchObject({
          code: "FORBIDDEN",
        });
      },
    );
  });

  describe("getPendingMcpConsentRequest", () => {
    it("returns the pending request for the matching user", async () => {
      const userId = await createUser("consent-valid", "founder");
      const clientId = await createClient("consent-valid");
      const consentCode = await createVerification({
        clientId,
        redirectURI: "https://claude.ai/callback",
        scope: ["mcp:connect", "offline_access"],
        userId,
        authTime: Date.now(),
        requireConsent: true,
      });

      const pending = await getPendingMcpConsentRequest(consentCode, userId);

      expect(pending).toMatchObject({
        consentCode,
        clientId,
        redirectHost: "claude.ai",
        scopes: ["mcp:connect", "offline_access"],
      });
    });

    it("throws NOT_FOUND for a different user", async () => {
      const userId = await createUser("consent-owner", "founder");
      const otherUserId = await createUser("consent-other", "founder");
      const clientId = await createClient("consent-cross-user");
      const consentCode = await createVerification({
        clientId,
        redirectURI: "https://claude.ai/callback",
        scope: ["mcp:connect", "offline_access"],
        userId,
        authTime: Date.now(),
        requireConsent: true,
      });

      await expect(
        getPendingMcpConsentRequest(consentCode, otherUserId),
      ).rejects.toBeInstanceOf(ServiceError);
      await expect(
        getPendingMcpConsentRequest(consentCode, otherUserId),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("throws NOT_FOUND once already accepted (requireConsent: false)", async () => {
      const userId = await createUser("consent-accepted", "founder");
      const clientId = await createClient("consent-accepted");
      const consentCode = await createVerification({
        clientId,
        redirectURI: "https://claude.ai/callback",
        scope: ["mcp:connect", "offline_access"],
        userId,
        authTime: Date.now(),
        requireConsent: false,
      });

      await expect(
        getPendingMcpConsentRequest(consentCode, userId),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("throws NOT_FOUND for an expired verification", async () => {
      const userId = await createUser("consent-expired", "founder");
      const clientId = await createClient("consent-expired");
      const consentCode = await createVerification(
        {
          clientId,
          redirectURI: "https://claude.ai/callback",
          scope: ["mcp:connect", "offline_access"],
          userId,
          authTime: Date.now(),
          requireConsent: true,
        },
        { expired: true },
      );

      await expect(
        getPendingMcpConsentRequest(consentCode, userId),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("throws NOT_FOUND when the client is disabled", async () => {
      const userId = await createUser("consent-disabled-client", "founder");
      const clientId = await createClient("consent-disabled-client", {
        disabled: true,
      });
      const consentCode = await createVerification({
        clientId,
        redirectURI: "https://claude.ai/callback",
        scope: ["mcp:connect", "offline_access"],
        userId,
        authTime: Date.now(),
        requireConsent: true,
      });

      await expect(
        getPendingMcpConsentRequest(consentCode, userId),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("throws NOT_FOUND when the scope carries anything beyond the granted set", async () => {
      const userId = await createUser("consent-bad-scope", "founder");
      const clientId = await createClient("consent-bad-scope");
      const consentCode = await createVerification({
        clientId,
        redirectURI: "https://claude.ai/callback",
        scope: ["mcp:connect", "offline_access", "openid"],
        userId,
        authTime: Date.now(),
        requireConsent: true,
      });

      await expect(
        getPendingMcpConsentRequest(consentCode, userId),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("throws NOT_FOUND when the scope is missing offline_access", async () => {
      // A verification row carrying only mcp:connect did not come through the
      // /mcp/authorize before-hook, which rewrites every request to the full
      // granted set. Rendering a consent screen for it would consent the
      // founder to a connection that dies in an hour.
      const userId = await createUser("consent-partial-scope", "founder");
      const clientId = await createClient("consent-partial-scope");
      const consentCode = await createVerification({
        clientId,
        redirectURI: "https://claude.ai/callback",
        scope: ["mcp:connect"],
        userId,
        authTime: Date.now(),
        requireConsent: true,
      });

      await expect(
        getPendingMcpConsentRequest(consentCode, userId),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("throws NOT_FOUND for a malformed consent code", async () => {
      const userId = await createUser("consent-malformed", "founder");

      await expect(
        getPendingMcpConsentRequest("not-a-real-code", userId),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("checkAuthorizationCodeIsRedeemable", () => {
    it("returns ok:true for a valid, already-consented S256 code", async () => {
      const userId = await createUser("redeem-valid", "founder");
      const clientId = await createClient("redeem-valid");
      const { codeVerifier, codeChallenge } = createPkcePair();
      const code = await createVerification({
        clientId,
        redirectURI: "https://claude.ai/callback",
        scope: ["mcp:connect", "offline_access"],
        userId,
        authTime: Date.now(),
        requireConsent: false,
        codeChallenge,
        codeChallengeMethod: "s256",
      });

      const result = await checkAuthorizationCodeIsRedeemable({
        code,
        clientId,
        redirectUri: "https://claude.ai/callback",
        codeVerifier,
      });

      expect(result).toEqual({ ok: true });
    });

    it("returns ok:true for a valid plain-method code", async () => {
      const userId = await createUser("redeem-plain", "founder");
      const clientId = await createClient("redeem-plain");
      const codeVerifier = randomFromAlphabet(ALPHANUMERIC, 64);
      const code = await createVerification({
        clientId,
        redirectURI: "https://claude.ai/callback",
        scope: ["mcp:connect", "offline_access"],
        userId,
        authTime: Date.now(),
        requireConsent: false,
        codeChallenge: codeVerifier,
        codeChallengeMethod: "plain",
      });

      const result = await checkAuthorizationCodeIsRedeemable({
        code,
        clientId,
        redirectUri: "https://claude.ai/callback",
        codeVerifier,
      });

      expect(result).toEqual({ ok: true });
    });

    it("rejects a malformed code as invalid_grant without querying the database", async () => {
      const result = await checkAuthorizationCodeIsRedeemable({
        code: "not-a-real-code",
        clientId: "whatever",
        redirectUri: "https://claude.ai/callback",
        codeVerifier: "whatever",
      });
      expect(result).toMatchObject({ ok: false, error: "invalid_grant" });
    });

    it("rejects an unknown code as invalid_grant", async () => {
      const result = await checkAuthorizationCodeIsRedeemable({
        code: newConsentCode(),
        clientId: "whatever",
        redirectUri: "https://claude.ai/callback",
        codeVerifier: "whatever",
      });
      expect(result).toMatchObject({ ok: false, error: "invalid_grant" });
    });

    it("rejects an expired code as invalid_grant", async () => {
      const userId = await createUser("redeem-expired", "founder");
      const clientId = await createClient("redeem-expired");
      const { codeVerifier, codeChallenge } = createPkcePair();
      const code = await createVerification(
        {
          clientId,
          redirectURI: "https://claude.ai/callback",
          scope: ["mcp:connect", "offline_access"],
          userId,
          authTime: Date.now(),
          requireConsent: false,
          codeChallenge,
          codeChallengeMethod: "s256",
        },
        { expired: true },
      );

      const result = await checkAuthorizationCodeIsRedeemable({
        code,
        clientId,
        redirectUri: "https://claude.ai/callback",
        codeVerifier,
      });
      expect(result).toMatchObject({ ok: false, error: "invalid_grant" });
    });

    it("rejects a code still awaiting consent (requireConsent: true) as invalid_grant — the code-exhaustion guard", async () => {
      const userId = await createUser("redeem-pending-consent", "founder");
      const clientId = await createClient("redeem-pending-consent");
      const { codeVerifier, codeChallenge } = createPkcePair();
      const code = await createVerification({
        clientId,
        redirectURI: "https://claude.ai/callback",
        scope: ["mcp:connect", "offline_access"],
        userId,
        authTime: Date.now(),
        requireConsent: true,
        codeChallenge,
        codeChallengeMethod: "s256",
      });

      const result = await checkAuthorizationCodeIsRedeemable({
        code,
        clientId,
        redirectUri: "https://claude.ai/callback",
        codeVerifier,
      });
      expect(result).toMatchObject({ ok: false, error: "invalid_grant" });
    });

    it("rejects a client_id mismatch as invalid_client without burning the code's validity", async () => {
      const userId = await createUser("redeem-wrong-client", "founder");
      const clientId = await createClient("redeem-wrong-client");
      const otherClientId = await createClient("redeem-wrong-client-other");
      const { codeVerifier, codeChallenge } = createPkcePair();
      const code = await createVerification({
        clientId,
        redirectURI: "https://claude.ai/callback",
        scope: ["mcp:connect", "offline_access"],
        userId,
        authTime: Date.now(),
        requireConsent: false,
        codeChallenge,
        codeChallengeMethod: "s256",
      });

      const wrongClient = await checkAuthorizationCodeIsRedeemable({
        code,
        clientId: otherClientId,
        redirectUri: "https://claude.ai/callback",
        codeVerifier,
      });
      expect(wrongClient).toMatchObject({ ok: false, error: "invalid_client" });

      // The same code is still redeemable afterward with the correct
      // client — the rejection above must not have consumed it.
      const correctClient = await checkAuthorizationCodeIsRedeemable({
        code,
        clientId,
        redirectUri: "https://claude.ai/callback",
        codeVerifier,
      });
      expect(correctClient).toEqual({ ok: true });
    });

    it("rejects a redirect_uri mismatch as invalid_client", async () => {
      const userId = await createUser("redeem-wrong-redirect", "founder");
      const clientId = await createClient("redeem-wrong-redirect");
      const { codeVerifier, codeChallenge } = createPkcePair();
      const code = await createVerification({
        clientId,
        redirectURI: "https://claude.ai/callback",
        scope: ["mcp:connect", "offline_access"],
        userId,
        authTime: Date.now(),
        requireConsent: false,
        codeChallenge,
        codeChallengeMethod: "s256",
      });

      const result = await checkAuthorizationCodeIsRedeemable({
        code,
        clientId,
        redirectUri: "https://evil.example/callback",
        codeVerifier,
      });
      expect(result).toMatchObject({ ok: false, error: "invalid_client" });
    });

    it("rejects a disabled client as invalid_client", async () => {
      const userId = await createUser("redeem-disabled-client", "founder");
      const clientId = await createClient("redeem-disabled-client", {
        disabled: true,
      });
      const { codeVerifier, codeChallenge } = createPkcePair();
      const code = await createVerification({
        clientId,
        redirectURI: "https://claude.ai/callback",
        scope: ["mcp:connect", "offline_access"],
        userId,
        authTime: Date.now(),
        requireConsent: false,
        codeChallenge,
        codeChallengeMethod: "s256",
      });

      const result = await checkAuthorizationCodeIsRedeemable({
        code,
        clientId,
        redirectUri: "https://claude.ai/callback",
        codeVerifier,
      });
      expect(result).toMatchObject({ ok: false, error: "invalid_client" });
    });

    it("rejects a missing code_verifier as invalid_request", async () => {
      const userId = await createUser("redeem-missing-verifier", "founder");
      const clientId = await createClient("redeem-missing-verifier");
      const { codeChallenge } = createPkcePair();
      const code = await createVerification({
        clientId,
        redirectURI: "https://claude.ai/callback",
        scope: ["mcp:connect", "offline_access"],
        userId,
        authTime: Date.now(),
        requireConsent: false,
        codeChallenge,
        codeChallengeMethod: "s256",
      });

      const result = await checkAuthorizationCodeIsRedeemable({
        code,
        clientId,
        redirectUri: "https://claude.ai/callback",
        codeVerifier: undefined,
      });
      expect(result).toMatchObject({ ok: false, error: "invalid_request" });
    });

    it("rejects a wrong code_verifier as invalid_grant (PKCE failure) without burning the code", async () => {
      const userId = await createUser("redeem-wrong-verifier", "founder");
      const clientId = await createClient("redeem-wrong-verifier");
      const { codeVerifier, codeChallenge } = createPkcePair();
      const code = await createVerification({
        clientId,
        redirectURI: "https://claude.ai/callback",
        scope: ["mcp:connect", "offline_access"],
        userId,
        authTime: Date.now(),
        requireConsent: false,
        codeChallenge,
        codeChallengeMethod: "s256",
      });

      const wrongVerifier = await checkAuthorizationCodeIsRedeemable({
        code,
        clientId,
        redirectUri: "https://claude.ai/callback",
        codeVerifier: `${codeVerifier}-tampered`,
      });
      expect(wrongVerifier).toMatchObject({
        ok: false,
        error: "invalid_grant",
      });

      const rightVerifier = await checkAuthorizationCodeIsRedeemable({
        code,
        clientId,
        redirectUri: "https://claude.ai/callback",
        codeVerifier,
      });
      expect(rightVerifier).toEqual({ ok: true });
    });

    it("rejects a deleted user's code as invalid_grant", async () => {
      const userId = await createUser("redeem-deleted-user", "founder", {
        deleted: true,
      });
      const clientId = await createClient("redeem-deleted-user");
      const { codeVerifier, codeChallenge } = createPkcePair();
      const code = await createVerification({
        clientId,
        redirectURI: "https://claude.ai/callback",
        scope: ["mcp:connect", "offline_access"],
        userId,
        authTime: Date.now(),
        requireConsent: false,
        codeChallenge,
        codeChallengeMethod: "s256",
      });

      const result = await checkAuthorizationCodeIsRedeemable({
        code,
        clientId,
        redirectUri: "https://claude.ai/callback",
        codeVerifier,
      });
      expect(result).toMatchObject({ ok: false, error: "invalid_grant" });
    });

    it("rejects a pending user's code as invalid_grant", async () => {
      const userId = await createUser("redeem-pending-user", "pending");
      const clientId = await createClient("redeem-pending-user");
      const { codeVerifier, codeChallenge } = createPkcePair();
      const code = await createVerification({
        clientId,
        redirectURI: "https://claude.ai/callback",
        scope: ["mcp:connect", "offline_access"],
        userId,
        authTime: Date.now(),
        requireConsent: false,
        codeChallenge,
        codeChallengeMethod: "s256",
      });

      const result = await checkAuthorizationCodeIsRedeemable({
        code,
        clientId,
        redirectUri: "https://claude.ai/callback",
        codeVerifier,
      });
      expect(result).toMatchObject({ ok: false, error: "invalid_grant" });
    });
  });

  describe("checkRefreshTokenIsRedeemable", () => {
    it("accepts a live refresh token presented by its own client", async () => {
      const userId = await createUser("refresh-ok", "founder");
      const clientId = await createClient("refresh-ok");
      const accessToken = await createAccessToken(clientId, userId);
      const refreshToken = await getRefreshTokenFor(accessToken);

      await expect(
        checkRefreshTokenIsRedeemable({ refreshToken, clientId }),
      ).resolves.toEqual({ ok: true });
    });

    it("accepts a refresh token whose access token has already expired", async () => {
      // The normal case, not an edge case: a client refreshes precisely
      // because its access token ran out.
      const userId = await createUser("refresh-after-expiry", "founder");
      const clientId = await createClient("refresh-after-expiry");
      const accessToken = await createAccessToken(clientId, userId, {
        expired: true,
      });
      const refreshToken = await getRefreshTokenFor(accessToken);

      await expect(
        checkRefreshTokenIsRedeemable({ refreshToken, clientId }),
      ).resolves.toEqual({ ok: true });
    });

    it("rejects a malformed refresh token without querying the database", async () => {
      await expect(
        checkRefreshTokenIsRedeemable({
          refreshToken: "not-a-token",
          clientId: "anything",
        }),
      ).resolves.toMatchObject({ ok: false, error: "invalid_grant" });
    });

    it("rejects a missing client_id", async () => {
      await expect(
        checkRefreshTokenIsRedeemable({
          refreshToken: newAccessToken(),
          clientId: undefined,
        }),
      ).resolves.toMatchObject({ ok: false, error: "invalid_client" });
    });

    // The reuse-detection case: rotation deletes the redeemed row, so a
    // replayed token is indistinguishable from one that never existed — and
    // must stay that way.
    it("rejects an unknown refresh token as invalid_grant", async () => {
      await expect(
        checkRefreshTokenIsRedeemable({
          refreshToken: newAccessToken(),
          clientId: await createClient("refresh-unknown"),
        }),
      ).resolves.toMatchObject({ ok: false, error: "invalid_grant" });
    });

    it("rejects an expired refresh token", async () => {
      const userId = await createUser("refresh-expired", "founder");
      const clientId = await createClient("refresh-expired");
      const accessToken = await createAccessToken(clientId, userId, {
        expired: true,
        refreshExpired: true,
      });
      const refreshToken = await getRefreshTokenFor(accessToken);

      await expect(
        checkRefreshTokenIsRedeemable({ refreshToken, clientId }),
      ).resolves.toMatchObject({ ok: false, error: "invalid_grant" });
    });

    it("rejects a refresh token presented by a different client", async () => {
      const userId = await createUser("refresh-wrong-client", "founder");
      const clientId = await createClient("refresh-wrong-client");
      const otherClientId = await createClient("refresh-wrong-client-other");
      const accessToken = await createAccessToken(clientId, userId);
      const refreshToken = await getRefreshTokenFor(accessToken);

      await expect(
        checkRefreshTokenIsRedeemable({
          refreshToken,
          clientId: otherClientId,
        }),
      ).resolves.toMatchObject({ ok: false, error: "invalid_client" });
    });

    it("rejects a refresh token whose client has been disabled", async () => {
      const userId = await createUser("refresh-disabled", "founder");
      const clientId = await createClient("refresh-disabled");
      const accessToken = await createAccessToken(clientId, userId);
      const refreshToken = await getRefreshTokenFor(accessToken);

      await pool.query(
        "update mcp_oauth_applications set disabled = true where client_id = $1",
        [clientId],
      );

      await expect(
        checkRefreshTokenIsRedeemable({ refreshToken, clientId }),
      ).resolves.toMatchObject({ ok: false, error: "invalid_client" });
    });

    it("rejects a token that was never granted offline_access", async () => {
      // Rows written before offline_access was granted — Better Auth's own
      // refresh branch refuses these too, but this returns the profile's
      // error shape rather than the plugin's.
      const userId = await createUser("refresh-no-offline", "founder");
      const clientId = await createClient("refresh-no-offline");
      const accessToken = await createAccessToken(clientId, userId, {
        scopes: "mcp:connect",
      });
      const refreshToken = await getRefreshTokenFor(accessToken);

      await expect(
        checkRefreshTokenIsRedeemable({ refreshToken, clientId }),
      ).resolves.toMatchObject({ ok: false, error: "invalid_grant" });
    });

    // The gap Better Auth's own refresh branch leaves open: it copies the
    // user id across without ever re-checking the account.
    it("rejects a refresh token belonging to a founder reverted to pending", async () => {
      const userId = await createUser("refresh-pending", "pending");
      const clientId = await createClient("refresh-pending");
      const accessToken = await createAccessToken(clientId, userId);
      const refreshToken = await getRefreshTokenFor(accessToken);

      await expect(
        checkRefreshTokenIsRedeemable({ refreshToken, clientId }),
      ).resolves.toMatchObject({ ok: false, error: "invalid_grant" });
    });

    it("rejects a refresh token whose user row is gone", async () => {
      const clientId = await createClient("refresh-no-user");
      const accessToken = await createAccessToken(clientId, null);
      const refreshToken = await getRefreshTokenFor(accessToken);

      await expect(
        checkRefreshTokenIsRedeemable({ refreshToken, clientId }),
      ).resolves.toMatchObject({ ok: false, error: "invalid_grant" });
    });
  });

  describe("rotateOutMcpRefreshToken", () => {
    it("removes every sibling row for the user+client, keeping only the new pair", async () => {
      const userId = await createUser("rotate", "founder");
      const clientId = await createClient("rotate");
      const accessToken = await createAccessToken(clientId, userId);
      const presentedRefresh = await getRefreshTokenFor(accessToken);
      const newAccess = await createAccessToken(clientId, userId);
      const newRefresh = await getRefreshTokenFor(newAccess);

      await expect(
        rotateOutMcpRefreshToken({
          presentedRefreshToken: presentedRefresh,
          newRefreshToken: newRefresh,
        }),
      ).resolves.toBe(1);

      // Rotation is revocation: the old pair stops working at once rather
      // than lingering for the rest of the access token's hour.
      await expect(verifyMcpBearerToken(accessToken)).rejects.toBeInstanceOf(
        ServiceError,
      );
      await expect(
        checkRefreshTokenIsRedeemable({
          refreshToken: presentedRefresh,
          clientId,
        }),
      ).resolves.toMatchObject({ ok: false, error: "invalid_grant" });
      await expect(verifyMcpBearerToken(newAccess)).resolves.toMatchObject({
        userId,
      });
    });

    it("clears a race sibling for the same user+client while keeping the winner", async () => {
      const userId = await createUser("rotate-family", "founder");
      const clientId = await createClient("rotate-family");
      const presented = await createAccessToken(clientId, userId);
      const raceSibling = await createAccessToken(clientId, userId);
      const winner = await createAccessToken(clientId, userId);

      await rotateOutMcpRefreshToken({
        presentedRefreshToken: await getRefreshTokenFor(presented),
        newRefreshToken: await getRefreshTokenFor(winner),
      });

      await expect(verifyMcpBearerToken(winner)).resolves.toMatchObject({
        userId,
      });
      await expect(verifyMcpBearerToken(presented)).rejects.toBeInstanceOf(
        ServiceError,
      );
      await expect(verifyMcpBearerToken(raceSibling)).rejects.toBeInstanceOf(
        ServiceError,
      );
    });

    it("leaves a different client's rows untouched", async () => {
      const userId = await createUser("rotate-isolation", "founder");
      const clientId = await createClient("rotate-isolation");
      const otherClientId = await createClient("rotate-isolation-other");
      const mine = await createAccessToken(clientId, userId);
      const replacement = await createAccessToken(clientId, userId);
      const untouched = await createAccessToken(otherClientId, userId);

      await rotateOutMcpRefreshToken({
        presentedRefreshToken: await getRefreshTokenFor(mine),
        newRefreshToken: await getRefreshTokenFor(replacement),
      });

      await expect(verifyMcpBearerToken(untouched)).resolves.toMatchObject({
        userId,
      });
    });

    // A concurrent revoke or sweep can get there first; the after-hook must
    // not treat that as a failure.
    it("reports zero for an unknown or blank token", async () => {
      await expect(
        rotateOutMcpRefreshToken({
          presentedRefreshToken: newAccessToken(),
          newRefreshToken: newAccessToken(),
        }),
      ).resolves.toBe(0);
      await expect(
        rotateOutMcpRefreshToken({
          presentedRefreshToken: "",
          newRefreshToken: "",
        }),
      ).resolves.toBe(0);
    });
  });

  describe("tryClaimRefreshToken", () => {
    function hashRefreshTokenForCleanup(refreshToken: string): string {
      return createHash("sha256").update(refreshToken, "utf8").digest("hex");
    }

    it("only lets the first of two concurrent claims for the same token succeed", async () => {
      const refreshToken = newAccessToken();
      createdRefreshClaimHashes.push(hashRefreshTokenForCleanup(refreshToken));

      const [first, second] = await Promise.all([
        tryClaimRefreshToken(refreshToken),
        tryClaimRefreshToken(refreshToken),
      ]);

      expect([first, second].filter(Boolean)).toHaveLength(1);
    });

    it("lets different tokens claim independently", async () => {
      const tokenA = newAccessToken();
      const tokenB = newAccessToken();
      createdRefreshClaimHashes.push(hashRefreshTokenForCleanup(tokenA));
      createdRefreshClaimHashes.push(hashRefreshTokenForCleanup(tokenB));

      await expect(tryClaimRefreshToken(tokenA)).resolves.toBe(true);
      await expect(tryClaimRefreshToken(tokenB)).resolves.toBe(true);
    });
  });

  describe("tryClaimConsentCode", () => {
    it("only lets the first of two concurrent claims for the same code succeed", async () => {
      const consentCode = newConsentCode();
      createdConsentClaimHashes.push(hashConsentCodeForCleanup(consentCode));

      const [first, second] = await Promise.all([
        tryClaimConsentCode(consentCode),
        tryClaimConsentCode(consentCode),
      ]);

      expect([first, second].filter(Boolean)).toHaveLength(1);
    });

    it("lets different codes claim independently", async () => {
      const codeA = newConsentCode();
      const codeB = newConsentCode();
      createdConsentClaimHashes.push(
        hashConsentCodeForCleanup(codeA),
        hashConsentCodeForCleanup(codeB),
      );

      const a = await tryClaimConsentCode(codeA);
      const b = await tryClaimConsentCode(codeB);
      expect(a).toBe(true);
      expect(b).toBe(true);
    });
  });

  describe("getOAuthClientByClientId / isValidPublicOAuthClientRecord", () => {
    it("finds a registered client and confirms it is a valid public client", async () => {
      const clientId = await createClient("lookup-valid");
      const client = await getOAuthClientByClientId(clientId);

      expect(client).toMatchObject({
        clientId,
        disabled: false,
        type: "public",
      });
      expect(isValidPublicOAuthClientRecord(client)).toBe(true);
    });

    it("returns null for an unknown client_id", async () => {
      const client = await getOAuthClientByClientId(
        `${idPrefix}-does-not-exist`,
      );
      expect(client).toBeNull();
      expect(isValidPublicOAuthClientRecord(client)).toBe(false);
    });

    it("flags a disabled client as not a valid public client", async () => {
      const clientId = await createClient("lookup-disabled", {
        disabled: true,
      });
      const client = await getOAuthClientByClientId(clientId);
      expect(isValidPublicOAuthClientRecord(client)).toBe(false);
    });

    it("flags a confidential client as not a valid public client", async () => {
      const clientId = await createClient("lookup-confidential", {
        type: "web",
        clientSecret: "some-secret",
      });
      const client = await getOAuthClientByClientId(clientId);
      expect(isValidPublicOAuthClientRecord(client)).toBe(false);
    });
  });

  describe("getAuthorizableUserById", () => {
    it("returns the user for an active Founder account", async () => {
      const userId = await createUser("authorizable", "founder");
      await expect(getAuthorizableUserById(userId)).resolves.toEqual({
        userId,
        role: "founder",
      });
    });

    it("returns null for a pending account", async () => {
      const userId = await createUser("authorizable-pending", "pending");
      await expect(getAuthorizableUserById(userId)).resolves.toBeNull();
    });

    // The issuing half of the same rule verifyMcpBearerToken enforces on
    // presentation. Closing only the presenting gate would still let a
    // Mentor complete a code exchange and hold a live, useless token.
    it.each(["mentor", "admin"] as const)(
      "returns null for a %s account",
      async (role) => {
        const userId = await createUser(`authorizable-${role}`, role);
        await expect(getAuthorizableUserById(userId)).resolves.toBeNull();
      },
    );

    it("returns null for a deleted account", async () => {
      const userId = await createUser("authorizable-deleted", "founder", {
        deleted: true,
      });
      await expect(getAuthorizableUserById(userId)).resolves.toBeNull();
    });

    it("returns null for an unknown user id", async () => {
      await expect(getAuthorizableUserById(randomUUID())).resolves.toBeNull();
    });
  });

  describe("getMcpConnectionStatus", () => {
    it("rejects a non-founder actor", async () => {
      const userId = await createUser("conn-admin", "admin");
      await expect(
        getMcpConnectionStatus(
          createWebActorContext({ userId, role: "admin" }),
        ),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("reports nothing at all for a founder with no tokens or consents", async () => {
      const userId = await createUser("conn-none", "founder");
      await expect(
        getMcpConnectionStatus(
          createWebActorContext({ userId, role: "founder" }),
        ),
      ).resolves.toEqual({
        authorised: false,
        clientName: null,
        clientId: null,
        authorisedAt: null,
        expiresAt: null,
        hasEverAuthorised: false,
        lastActivityAt: null,
        provider: null,
      });
    });

    // The connection page names the connected assistant from this, so that
    // a founder who set the site up for one and is connected with the other
    // is not shown a status card describing the wrong product.
    it("identifies the connected vendor from the client's redirect host", async () => {
      const userId = await createUser("conn-provider", "founder");
      const clientId = await createClient("conn-provider", {
        redirectUrls: "https://chatgpt.com/connector_platform_oauth_redirect",
      });
      await createAccessToken(clientId, userId);
      await createGrant(userId, clientId);

      const status = await getMcpConnectionStatus(
        createWebActorContext({ userId, role: "founder" }),
      );

      expect(status.authorised).toBe(true);
      expect(status.provider).toBe("openai");
    });

    // A client that registered a redirect we don't recognise is not
    // evidence for any vendor, and the UI must not guess from its
    // self-chosen display name.
    it("reports an unrecognised client as other rather than guessing", async () => {
      const userId = await createUser("conn-provider-other", "founder");
      const clientId = await createClient("conn-provider-other", {
        redirectUrls: "https://example.test/callback",
      });
      await createAccessToken(clientId, userId);
      await createGrant(userId, clientId);

      const status = await getMcpConnectionStatus(
        createWebActorContext({ userId, role: "founder" }),
      );

      expect(status.provider).toBe("other");
    });

    it("dates the connection from the grant, not the rotated token row", async () => {
      const userId = await createUser("conn-granted-at", "founder");
      const clientId = await createClient("conn-granted-at");
      // A token row created just now — i.e. what any active founder's row
      // looks like, because rotation replaces it hourly.
      await createAccessToken(clientId, userId);
      await createGrant(userId, clientId, { daysAgo: 40 });
      await insertAuditLog(userId, { minutesAgo: 5 });

      const status = await getMcpConnectionStatus(
        createWebActorContext({ userId, role: "founder" }),
      );

      // Reading created_at here (which is what this used to do) told every
      // active founder they had connected within the last hour.
      const ageDays =
        (Date.now() - new Date(status.authorisedAt!).getTime()) /
        (24 * 3_600_000);
      expect(ageDays).toBeGreaterThan(39);
      expect(ageDays).toBeLessThan(41);

      // And the reconnect-by date is the soonest of the three deadlines —
      // here the 14-day idle one, not the token's own 30-day expiry.
      const daysUntilExpiry =
        (new Date(status.expiresAt!).getTime() - Date.now()) / (24 * 3_600_000);
      expect(daysUntilExpiry).toBeGreaterThan(13);
      expect(daysUntilExpiry).toBeLessThan(15);
    });

    it("reports a connection past its idle deadline as no longer authorised", async () => {
      const userId = await createUser("conn-idled-out", "founder");
      const clientId = await createClient("conn-idled-out");
      // Unexpired token rows, but a grant that went 40 days without a single
      // tool call. Retirement only happens when the client next tries to
      // refresh, and an idle connection is precisely one that is not
      // refreshing — so these rows can outlive the deadline by weeks.
      await createAccessToken(clientId, userId);
      await createGrant(userId, clientId, { daysAgo: 40 });
      await pool.query(
        `insert into mcp_oauth_consents (client_id, user_id, scopes, consent_given)
         values ($1, $2, 'mcp:connect', true)`,
        [clientId, userId],
      );

      const status = await getMcpConnectionStatus(
        createWebActorContext({ userId, role: "founder" }),
      );

      // Reporting `authorised: true` here rendered "Connected — stays
      // connected until <a date in the past>".
      expect(status.authorised).toBe(false);
      expect(status.expiresAt).toBeNull();
      // Still "reconnect", not first-time setup.
      expect(status.hasEverAuthorised).toBe(true);
    });

    it("reports authorised with client metadata for a live token", async () => {
      const userId = await createUser("conn-live", "founder");
      const clientId = await createClient("conn-live");
      await createAccessToken(clientId, userId);
      await pool.query(
        `insert into mcp_oauth_consents (client_id, user_id, scopes, consent_given)
         values ($1, $2, 'mcp:connect', true)`,
        [clientId, userId],
      );

      const status = await getMcpConnectionStatus(
        createWebActorContext({ userId, role: "founder" }),
      );
      expect(status.authorised).toBe(true);
      expect(status.clientName).toBe("Test Client conn-live");
      expect(status.hasEverAuthorised).toBe(true);
      expect(status.authorisedAt).not.toBeNull();
      expect(new Date(status.expiresAt as string).getTime()).toBeGreaterThan(
        Date.now(),
      );
    });

    // The distinction the whole two-field split exists for: a valid token
    // says nothing about whether the client has ever actually called us.
    it("reports a live token with no tool calls as authorised but never used", async () => {
      const userId = await createUser("conn-never-used", "founder");
      const clientId = await createClient("conn-never-used");
      await createAccessToken(clientId, userId);

      const status = await getMcpConnectionStatus(
        createWebActorContext({ userId, role: "founder" }),
      );
      expect(status.authorised).toBe(true);
      expect(status.lastActivityAt).toBeNull();
    });

    it("surfaces the most recent tool call as lastActivityAt", async () => {
      const userId = await createUser("conn-activity", "founder");
      const clientId = await createClient("conn-activity");
      await createAccessToken(clientId, userId);

      await insertAuditLog(userId, { minutesAgo: 90 });
      await insertAuditLog(userId, { minutesAgo: 2 });

      const status = await getMcpConnectionStatus(
        createWebActorContext({ userId, role: "founder" }),
      );
      const elapsedMinutes =
        (Date.now() - new Date(status.lastActivityAt as string).getTime()) /
        60_000;
      expect(elapsedMinutes).toBeGreaterThan(1);
      expect(elapsedMinutes).toBeLessThan(5);
    });

    // A client that reaches us and gets rejected is still a client that
    // reached us — failed calls are evidence of liveness too.
    it("counts a denied tool call as activity", async () => {
      const userId = await createUser("conn-denied-activity", "founder");
      const clientId = await createClient("conn-denied-activity");
      await createAccessToken(clientId, userId);
      await insertAuditLog(userId, { minutesAgo: 1, outcome: "denied" });

      const status = await getMcpConnectionStatus(
        createWebActorContext({ userId, role: "founder" }),
      );
      expect(status.lastActivityAt).not.toBeNull();
    });

    it("keeps one founder's activity out of another's status", async () => {
      const userId = await createUser("conn-activity-mine", "founder");
      const otherUserId = await createUser("conn-activity-theirs", "founder");
      const clientId = await createClient("conn-activity-isolation");
      await createAccessToken(clientId, userId);
      await insertAuditLog(otherUserId, { minutesAgo: 1 });

      const status = await getMcpConnectionStatus(
        createWebActorContext({ userId, role: "founder" }),
      );
      expect(status.lastActivityAt).toBeNull();
    });

    // The single most important case for the refresh-token change: an hour
    // after connecting, every founder's access token is expired. If that made
    // them "not authorised", the Connection page would tell them to reconnect
    // in Claude every hour — the exact bug refresh tokens exist to fix.
    it("stays authorised when only the access token has expired", async () => {
      const userId = await createUser("conn-access-expired", "founder");
      const clientId = await createClient("conn-access-expired");
      await createAccessToken(clientId, userId, { expired: true });

      const status = await getMcpConnectionStatus(
        createWebActorContext({ userId, role: "founder" }),
      );
      expect(status.authorised).toBe(true);
      expect(status.clientName).toBe("Test Client conn-access-expired");
      // expiresAt reports when the connection itself ends — the refresh
      // token's expiry, weeks out, not the access token's, already past.
      expect(new Date(status.expiresAt as string).getTime()).toBeGreaterThan(
        Date.now(),
      );
    });

    it("keeps reporting activity after the connection has fully expired", async () => {
      const userId = await createUser("conn-expired-activity", "founder");
      const clientId = await createClient("conn-expired-activity");
      await createAccessToken(clientId, userId, {
        expired: true,
        refreshExpired: true,
      });
      await insertAuditLog(userId, { minutesAgo: 30 });

      const status = await getMcpConnectionStatus(
        createWebActorContext({ userId, role: "founder" }),
      );
      expect(status.authorised).toBe(false);
      expect(status.lastActivityAt).not.toBeNull();
    });

    it("reports previously-authorised once every token has fully expired", async () => {
      const userId = await createUser("conn-expired", "founder");
      const clientId = await createClient("conn-expired");
      await createAccessToken(clientId, userId, {
        expired: true,
        refreshExpired: true,
      });
      await pool.query(
        `insert into mcp_oauth_consents (client_id, user_id, scopes, consent_given)
         values ($1, $2, 'mcp:connect offline_access', true)`,
        [clientId, userId],
      );

      await expect(
        getMcpConnectionStatus(
          createWebActorContext({ userId, role: "founder" }),
        ),
      ).resolves.toMatchObject({
        authorised: false,
        clientName: null,
        hasEverAuthorised: true,
      });
    });

    it("ignores live tokens issued to a disabled client", async () => {
      const userId = await createUser("conn-disabled", "founder");
      const clientId = await createClient("conn-disabled", { disabled: true });
      await createAccessToken(clientId, userId);

      await expect(
        getMcpConnectionStatus(
          createWebActorContext({ userId, role: "founder" }),
        ),
      ).resolves.toMatchObject({ authorised: false });
    });

    it("does not treat a consent_given=false record as ever-authorised", async () => {
      const userId = await createUser("conn-denied", "founder");
      const clientId = await createClient("conn-denied");
      await pool.query(
        `insert into mcp_oauth_consents (client_id, user_id, scopes, consent_given)
         values ($1, $2, 'mcp:connect', false)`,
        [clientId, userId],
      );

      await expect(
        getMcpConnectionStatus(
          createWebActorContext({ userId, role: "founder" }),
        ),
      ).resolves.toMatchObject({
        authorised: false,
        hasEverAuthorised: false,
      });
    });
  });

  // Until these existed, "disconnect" had no server-side meaning at all:
  // removing the connector in Claude is client-side, so the token stayed
  // live and both the website and verifyMcpBearerToken went on honouring
  // it.
  describe("revokeMcpConnectionForUser", () => {
    it("removes every live token the Founder holds and reports the count", async () => {
      const userId = await createUser("revoke-all", "founder");
      const clientA = await createClient("revoke-a");
      const clientB = await createClient("revoke-b");
      await createAccessToken(clientA, userId);
      await createAccessToken(clientB, userId);

      const result = await revokeMcpConnectionForUser(
        createWebActorContext({ userId, role: "founder" }),
      );

      expect(result.accessTokensRevoked).toBe(2);
      await expect(
        getMcpConnectionStatus(
          createWebActorContext({ userId, role: "founder" }),
        ),
      ).resolves.toMatchObject({ authorised: false });
    });

    it("removes the grant too, so reconnecting starts a fresh 90 days", async () => {
      const userId = await createUser("revoke-grant", "founder");
      const clientId = await createClient("revoke-grant-client");
      await createAccessToken(clientId, userId);
      await createGrant(userId, clientId, { daysAgo: 80 });

      await revokeMcpConnectionForUser(
        createWebActorContext({ userId, role: "founder" }),
      );

      // Leaving it would let a reconnection inherit an already-part-spent
      // absolute cap, when disconnecting plainly meant starting over.
      expect(await getGrantedAt(userId, clientId)).toBeNull();
    });

    it("leaves other Founders' tokens alone", async () => {
      const mine = await createUser("revoke-mine", "founder");
      const theirs = await createUser("revoke-theirs", "founder");
      const clientId = await createClient("revoke-shared");
      await createAccessToken(clientId, mine);
      const theirToken = await createAccessToken(clientId, theirs);

      await revokeMcpConnectionForUser(
        createWebActorContext({ userId: mine, role: "founder" }),
      );

      // Still a working credential for the other Founder — revocation is
      // per-user, not per-client.
      await expect(verifyMcpBearerToken(theirToken)).resolves.toMatchObject({
        userId: theirs,
      });
    });

    // Reachable by a double-click or a stale tab, so it must not error.
    it("is idempotent when there is nothing to revoke", async () => {
      const userId = await createUser("revoke-twice", "founder");
      const clientId = await createClient("revoke-twice-client");
      await createAccessToken(clientId, userId);
      const actor = createWebActorContext({ userId, role: "founder" });

      await expect(revokeMcpConnectionForUser(actor)).resolves.toMatchObject({
        accessTokensRevoked: 1,
      });
      await expect(revokeMcpConnectionForUser(actor)).resolves.toMatchObject({
        accessTokensRevoked: 0,
      });
    });

    it("records the withdrawal without making the Founder look new", async () => {
      const userId = await createUser("revoke-consent", "founder");
      const clientId = await createClient("revoke-consent-client");
      await createAccessToken(clientId, userId);
      const actor = createWebActorContext({ userId, role: "founder" });

      await revokeMcpConnectionForUser(actor);

      // hasEverAuthorised drives "reconnect" vs "set this up" copy, and it
      // reads consent_given — a withdrawal row must not switch a returning
      // Founder back to first-time wording.
      const withdrawals = await pool.query<{ count: string }>(
        `select count(*)::text as count from mcp_oauth_consents
         where user_id = $1 and consent_given = false`,
        [userId],
      );
      expect(Number(withdrawals.rows[0].count)).toBe(1);
    });
  });

  describe("revokeMcpAccessToken", () => {
    it("kills the token for the enforcement path, not just the display one", async () => {
      const userId = await createUser("revoke-token", "founder");
      const clientId = await createClient("revoke-token-client");
      const token = await createAccessToken(clientId, userId);

      await expect(verifyMcpBearerToken(token)).resolves.toMatchObject({
        userId,
      });

      await revokeMcpAccessToken(token);

      await expect(verifyMcpBearerToken(token)).rejects.toBeInstanceOf(
        ServiceError,
      );
    });

    // RFC 7009 §2.1 lets the client submit either token type. Revoking by
    // refresh token has to kill the access token on the same row too —
    // otherwise a disconnect would leave the connection able to refresh
    // itself back to life.
    it("revokes the whole pair when given the refresh token", async () => {
      const userId = await createUser("revoke-refresh", "founder");
      const clientId = await createClient("revoke-refresh-client");
      const accessToken = await createAccessToken(clientId, userId);
      const refreshToken = await getRefreshTokenFor(accessToken);

      await revokeMcpAccessToken(refreshToken);

      await expect(verifyMcpBearerToken(accessToken)).rejects.toBeInstanceOf(
        ServiceError,
      );
      await expect(
        checkRefreshTokenIsRedeemable({ refreshToken, clientId }),
      ).resolves.toMatchObject({ ok: false, error: "invalid_grant" });
    });

    // RFC 7009 §2.2: an unknown token is a success, so the endpoint can't
    // be used to probe which tokens exist.
    it("treats an unknown or blank token as a no-op", async () => {
      await expect(
        revokeMcpAccessToken("no-such-token-value"),
      ).resolves.toBeUndefined();
      await expect(revokeMcpAccessToken("")).resolves.toBeUndefined();
    });
  });

  // Deliberately the last describe block in this file: cleanupExpiredMcpOAuthState
  // deletes matching rows table-wide, not scoped to this test file's own
  // fixtures, so it must only ever run once every other test's assertions
  describe("recordMcpGrantIssued", () => {
    it("records the grant and evicts every other connected client", async () => {
      const userId = await createUser("grant-evict", "founder");
      const claudeClientId = await createClient("grant-evict-claude");
      const chatgptClientId = await createClient("grant-evict-chatgpt");

      const claudeToken = await createAccessToken(claudeClientId, userId);
      await createGrant(userId, claudeClientId, { daysAgo: 10 });

      // The founder now authorises a second assistant.
      const chatgptToken = await createAccessToken(chatgptClientId, userId);
      await recordMcpGrantIssued({ accessToken: chatgptToken });

      // One connection at a time: Claude is gone, tokens and grant both.
      // Before this rule existed both stayed live and the connection page
      // showed only the newer one, so the older connection kept working
      // while being invisible to the founder.
      await expect(verifyMcpBearerToken(claudeToken)).rejects.toThrow(
        ServiceError,
      );
      expect(await getGrantedAt(userId, claudeClientId)).toBeNull();

      const surviving = await verifyMcpBearerToken(chatgptToken);
      expect(surviving.userId).toBe(userId);
      expect(await getGrantedAt(userId, chatgptClientId)).not.toBeNull();

      // The eviction is recorded as a withdrawal, the same as if the
      // founder had disconnected Claude by hand — which, indirectly, they
      // did: the consent screen told them this would happen.
      const withdrawal = await pool.query(
        `select 1 from mcp_oauth_consents
         where user_id = $1 and client_id = $2 and not consent_given`,
        [userId, claudeClientId],
      );
      expect(withdrawal.rowCount).toBe(1);
    });

    // Connecting is one of the three ways a founder chooses an assistant
    // (the others being the first-run dialog and the profile switcher), so
    // it has to leave the same record behind. Without this, a founder who
    // connected ChatGPT directly would keep being shown Claude's set-up
    // steps and Claude hand-off buttons for a Claude that no longer has
    // any access — the eviction above saw to that.
    it("points the website's stored preference at whatever just connected", async () => {
      const userId = await createUser("grant-preference", "founder");
      await pool.query(
        `insert into user_profiles (user_id, preferred_ai_provider)
         values ($1, 'claude')`,
        [userId],
      );
      const clientId = await createClient("grant-preference", {
        redirectUrls: "https://chatgpt.com/connector_platform_oauth_redirect",
      });

      await recordMcpGrantIssued({
        accessToken: await createAccessToken(clientId, userId),
      });

      const profile = await pool.query<{ preferred_ai_provider: string }>(
        `select preferred_ai_provider from user_profiles where user_id = $1`,
        [userId],
      );
      expect(profile.rows[0]?.preferred_ai_provider).toBe("openai");
    });

    // A client we cannot place is not evidence for either product, and
    // guessing would silently rewrite the founder's set-up instructions.
    it("leaves the preference alone for an unrecognised client", async () => {
      const userId = await createUser("grant-preference-other", "founder");
      await pool.query(
        `insert into user_profiles (user_id, preferred_ai_provider)
         values ($1, 'claude')`,
        [userId],
      );
      const clientId = await createClient("grant-preference-other", {
        redirectUrls: "https://example.test/callback",
      });

      await recordMcpGrantIssued({
        accessToken: await createAccessToken(clientId, userId),
      });

      const profile = await pool.query<{ preferred_ai_provider: string }>(
        `select preferred_ai_provider from user_profiles where user_id = $1`,
        [userId],
      );
      expect(profile.rows[0]?.preferred_ai_provider).toBe("claude");
    });

    // The write goes through upsertPreferredAiProvider (profile/internal),
    // the same upsert setPreferredAiProvider uses for a Founder-driven
    // change — so it creates the row here too, rather than assuming one
    // already exists. In practice a Founder who reaches an authorisation
    // has been through the first-run dialog and already has a row; this
    // is the fallback holding regardless, rather than a second place that
    // assumption has to keep being true.
    it("creates a profile row for a founder who has none", async () => {
      const userId = await createUser("grant-preference-norow", "founder");
      const clientId = await createClient("grant-preference-norow");

      await recordMcpGrantIssued({
        accessToken: await createAccessToken(clientId, userId),
      });

      const profile = await pool.query<{ preferred_ai_provider: string }>(
        `select preferred_ai_provider from user_profiles where user_id = $1`,
        [userId],
      );
      expect(profile.rows[0]?.preferred_ai_provider).toBe("claude");
    });

    it("restarts the clock when the same client re-authorises", async () => {
      const userId = await createUser("grant-reauth", "founder");
      const clientId = await createClient("grant-reauth");
      await createGrant(userId, clientId, { daysAgo: 80 });

      const accessToken = await createAccessToken(clientId, userId);
      await recordMcpGrantIssued({ accessToken });

      // Reconnecting is the intended escape hatch from the 90-day cap.
      const grantedAt = await getGrantedAt(userId, clientId);
      expect(Date.now() - grantedAt!.getTime()).toBeLessThan(60_000);
    });

    it("leaves granted_at alone when a refresh rotates the token row", async () => {
      const userId = await createUser("grant-rotation", "founder");
      const clientId = await createClient("grant-rotation");
      await createGrant(userId, clientId, { daysAgo: 30 });
      const before = await getGrantedAt(userId, clientId);

      const oldToken = await createAccessToken(clientId, userId);
      const newToken = await createAccessToken(clientId, userId);
      await rotateOutMcpRefreshToken({
        presentedRefreshToken: await getRefreshTokenFor(oldToken),
        newRefreshToken: await getRefreshTokenFor(newToken),
      });

      // The whole reason the grant is its own table. If rotation reset this,
      // the 90-day cap would restart hourly and could never fire.
      expect((await getGrantedAt(userId, clientId))!.getTime()).toBe(
        before!.getTime(),
      );
    });
  });

  describe("connection lifetime limits", () => {
    async function setUpConnection(
      label: string,
      options: { daysAgo: number },
    ): Promise<{ userId: string; clientId: string; refreshToken: string }> {
      const userId = await createUser(label, "founder");
      const clientId = await createClient(label);
      const accessToken = await createAccessToken(clientId, userId);
      await createGrant(userId, clientId, { daysAgo: options.daysAgo });
      return {
        userId,
        clientId,
        refreshToken: await getRefreshTokenFor(accessToken),
      };
    }

    it("allows a refresh just inside the absolute maximum age", async () => {
      const { clientId, refreshToken } = await setUpConnection("age-89", {
        daysAgo: 89,
      });
      await insertAuditLog(
        (
          await pool.query<{ user_id: string }>(
            "select user_id from mcp_oauth_access_tokens where refresh_token = $1",
            [refreshToken],
          )
        ).rows[0].user_id,
        { minutesAgo: 10 },
      );

      await expect(
        checkRefreshTokenIsRedeemable({ refreshToken, clientId }),
      ).resolves.toEqual({ ok: true });
    });

    it("refuses and retires a connection past the absolute maximum age", async () => {
      const { userId, clientId, refreshToken } = await setUpConnection(
        "age-91",
        { daysAgo: 91 },
      );
      // Active right up to the moment it aged out — the absolute cap is the
      // one limit heavy use cannot postpone, which is what makes it the rule
      // that catches a stolen token being kept warm.
      await insertAuditLog(userId, { minutesAgo: 1 });

      const result = await checkRefreshTokenIsRedeemable({
        refreshToken,
        clientId,
      });
      expect(result).toEqual({
        ok: false,
        error: "invalid_grant",
        description:
          "This connection has reached its maximum age and must be re-authorised.",
      });

      // Retired, not just refused: leaving the rows would keep the
      // connection page reporting a live connection whose every refresh is
      // being rejected.
      const tokens = await pool.query(
        "select 1 from mcp_oauth_access_tokens where user_id = $1",
        [userId],
      );
      expect(tokens.rowCount).toBe(0);
      expect(await getGrantedAt(userId, clientId)).toBeNull();
    });

    it("refuses a connection that has gone unused past the idle timeout", async () => {
      const { userId, clientId, refreshToken } = await setUpConnection(
        "idle-out",
        { daysAgo: 15 },
      );

      const result = await checkRefreshTokenIsRedeemable({
        refreshToken,
        clientId,
      });
      expect(result).toEqual({
        ok: false,
        error: "invalid_grant",
        description:
          "This connection has been idle too long and must be re-authorised.",
      });
      expect(await getGrantedAt(userId, clientId)).toBeNull();
    });

    it("keeps a connection alive on a tool call made since it was granted", async () => {
      const { userId, clientId, refreshToken } = await setUpConnection(
        "idle-active",
        { daysAgo: 15 },
      );
      await insertAuditLog(userId, { minutesAgo: 60 * 24 });

      await expect(
        checkRefreshTokenIsRedeemable({ refreshToken, clientId }),
      ).resolves.toEqual({ ok: true });
    });

    it("is not kept alive by activity from before the grant", async () => {
      const { userId, clientId, refreshToken } = await setUpConnection(
        "idle-stale-activity",
        { daysAgo: 15 },
      );
      // A tool call from the assistant that was connected *before* this one.
      // Scoping the idle window to `created_at >= granted_at` is what makes
      // switching assistants genuinely restart the clock — otherwise the
      // outgoing client's history would prop up the incoming one.
      await insertAuditLog(userId, { minutesAgo: 60 * 24 * 20 });

      const result = await checkRefreshTokenIsRedeemable({
        refreshToken,
        clientId,
      });
      expect(result.ok).toBe(false);
    });

    it("creates a missing grant row and allows the refresh", async () => {
      const userId = await createUser("grant-missing", "founder");
      const clientId = await createClient("grant-missing");
      const accessToken = await createAccessToken(clientId, userId);
      const refreshToken = await getRefreshTokenFor(accessToken);

      // A token minted between the migration and this code deploying. Fails
      // open on purpose: rejecting would disconnect a real founder over a
      // deploy-ordering artefact.
      expect(await getGrantedAt(userId, clientId)).toBeNull();

      await expect(
        checkRefreshTokenIsRedeemable({ refreshToken, clientId }),
      ).resolves.toEqual({ ok: true });

      expect(await getGrantedAt(userId, clientId)).not.toBeNull();
    });

    it("clamps a refresh expiry down to the absolute cap, never up", async () => {
      const userId = await createUser("clamp", "founder");
      const clientId = await createClient("clamp");
      const accessToken = await createAccessToken(clientId, userId);
      const refreshToken = await getRefreshTokenFor(accessToken);
      await createGrant(userId, clientId, { daysAgo: 89 });

      // The fixture row claims the usual 30 days, which would run 28 days
      // past a cap that is one day away.
      await clampMcpRefreshTokenExpiryToGrant({ refreshToken });

      const clamped = await pool.query<{ refresh_token_expires_at: Date }>(
        "select refresh_token_expires_at from mcp_oauth_access_tokens where refresh_token = $1",
        [refreshToken],
      );
      const remainingMs =
        clamped.rows[0].refresh_token_expires_at.getTime() - Date.now();
      expect(remainingMs).toBeLessThan(2 * 24 * 3_600_000);

      // And a grant well inside its cap is left untouched.
      const freshUserId = await createUser("clamp-fresh", "founder");
      const freshClientId = await createClient("clamp-fresh");
      const freshAccess = await createAccessToken(freshClientId, freshUserId);
      const freshRefresh = await getRefreshTokenFor(freshAccess);
      await createGrant(freshUserId, freshClientId, { daysAgo: 1 });

      const before = await pool.query<{ refresh_token_expires_at: Date }>(
        "select refresh_token_expires_at from mcp_oauth_access_tokens where refresh_token = $1",
        [freshRefresh],
      );
      await clampMcpRefreshTokenExpiryToGrant({ refreshToken: freshRefresh });
      const after = await pool.query<{ refresh_token_expires_at: Date }>(
        "select refresh_token_expires_at from mcp_oauth_access_tokens where refresh_token = $1",
        [freshRefresh],
      );
      expect(after.rows[0].refresh_token_expires_at.getTime()).toBe(
        before.rows[0].refresh_token_expires_at.getTime(),
      );
    });
  });

  describe("mcpProviderForRedirectUris", () => {
    it("identifies each assistant from its registered redirect host", () => {
      expect(
        mcpProviderForRedirectUris(["https://claude.ai/api/mcp/auth_callback"]),
      ).toBe("claude");
      expect(mcpProviderForRedirectUris(["https://claude.com/callback"])).toBe(
        "claude",
      );
      expect(
        mcpProviderForRedirectUris([
          "https://chatgpt.com/connector_platform_oauth_redirect",
        ]),
      ).toBe("openai");
    });

    it("returns other for anything it cannot confidently identify", () => {
      // Registration is open, so an unrecognised client is normal and gets
      // recorded honestly rather than forced into a known brand.
      expect(mcpProviderForRedirectUris(["https://example.com/cb"])).toBe(
        "other",
      );
      expect(mcpProviderForRedirectUris([])).toBe("other");
      expect(mcpProviderForRedirectUris(["not-a-url"])).toBe("other");

      // Suffix matching is on a dot boundary — the reason to prefer the host
      // over the self-declared client_name is that it is harder to spoof, so
      // a lookalike domain must not pass.
      expect(mcpProviderForRedirectUris(["https://notclaude.ai/cb"])).toBe(
        "other",
      );

      // Ambiguous registration is not evidence for either one.
      expect(
        mcpProviderForRedirectUris([
          "https://claude.ai/cb",
          "https://chatgpt.com/cb",
        ]),
      ).toBe("other");
    });

    it("is carried onto the actor by verifyMcpBearerToken", async () => {
      const userId = await createUser("provider-actor", "founder");
      const clientId = `${idPrefix}-client-provider-openai`;
      await pool.query(
        `insert into mcp_oauth_applications
           (name, client_id, client_secret, redirect_urls, type, disabled)
         values ($1, $2, null, $3, 'public', false)`,
        [
          "ChatGPT",
          clientId,
          "https://chatgpt.com/connector_platform_oauth_redirect",
        ],
      );
      createdClientIds.push(clientId);

      const accessToken = await createAccessToken(clientId, userId);
      const actor = await verifyMcpBearerToken(accessToken);

      // Feeds mcp_tool_audit_logs.provider, which was hardcoded to "claude"
      // and so could not tell you which assistant made a call.
      expect(actor.provider).toBe("openai");
    });
  });

  // against its own fixtures have already completed.
  describe("cleanupExpiredMcpOAuthState", () => {
    it("deletes expired access tokens, expired consent/refresh claims, and orphaned (never-consented, past the grace period) applications", async () => {
      const userId = await createUser("cleanup", "founder");

      const expiredTokenClientId = await createClient("cleanup-expired-token");
      await createAccessToken(expiredTokenClientId, userId, {
        expired: true,
        refreshExpired: true,
      });

      const liveTokenClientId = await createClient("cleanup-live-token");
      const liveToken = await createAccessToken(liveTokenClientId, userId);

      // The row this sweep must not touch: its access token lapsed an hour
      // in, but its refresh token has weeks left. Deleting it would end a
      // live connection and force the Founder to reconnect in Claude.
      const refreshableClientId = await createClient("cleanup-refreshable");
      const refreshableToken = await createAccessToken(
        refreshableClientId,
        userId,
        { expired: true },
      );

      const expiredClaimHash = hashConsentCodeForCleanup(newConsentCode());
      await pool.query(
        `insert into mcp_oauth_consent_claims (consent_code_hash, expires_at)
         values ($1, now() - interval '1 minute')`,
        [expiredClaimHash],
      );
      createdConsentClaimHashes.push(expiredClaimHash);

      const liveClaimHash = hashConsentCodeForCleanup(newConsentCode());
      await pool.query(
        `insert into mcp_oauth_consent_claims (consent_code_hash, expires_at)
         values ($1, now() + interval '1 minute')`,
        [liveClaimHash],
      );
      createdConsentClaimHashes.push(liveClaimHash);

      const expiredRefreshClaimHash = createHash("sha256")
        .update(newAccessToken(), "utf8")
        .digest("hex");
      await pool.query(
        `insert into mcp_oauth_refresh_claims (refresh_token_hash, expires_at)
         values ($1, now() - interval '1 minute')`,
        [expiredRefreshClaimHash],
      );
      createdRefreshClaimHashes.push(expiredRefreshClaimHash);

      const liveRefreshClaimHash = createHash("sha256")
        .update(newAccessToken(), "utf8")
        .digest("hex");
      await pool.query(
        `insert into mcp_oauth_refresh_claims (refresh_token_hash, expires_at)
         values ($1, now() + interval '1 minute')`,
        [liveRefreshClaimHash],
      );
      createdRefreshClaimHashes.push(liveRefreshClaimHash);

      // Orphaned: no mcp_oauth_consents row, backdated past the grace period.
      const orphanedClientId = await createClient("cleanup-orphaned");
      await pool.query(
        `update mcp_oauth_applications set created_at = now() - interval '25 hours'
         where client_id = $1`,
        [orphanedClientId],
      );

      // Not orphaned: no consent yet, but registered too recently to sweep.
      const recentClientId = await createClient("cleanup-recent");

      // Not orphaned: has a real consent row, even though its access token
      // (created above) already expired — a real Accept keeps a client
      // alive regardless of its tokens' state.
      await pool.query(
        `insert into mcp_oauth_consents (client_id, user_id, scopes, consent_given)
         values ($1, $2, 'mcp:connect', true)`,
        [expiredTokenClientId, userId],
      );

      // A grant whose tokens were already swept, plus one belonging to a
      // live connection that must survive.
      await createGrant(userId, expiredTokenClientId);
      await createGrant(userId, liveTokenClientId);

      const result = await cleanupExpiredMcpOAuthState();

      expect(result.expiredAccessTokensDeleted).toBeGreaterThanOrEqual(1);
      expect(result.expiredConsentClaimsDeleted).toBeGreaterThanOrEqual(1);
      expect(result.expiredRefreshClaimsDeleted).toBeGreaterThanOrEqual(1);
      expect(result.orphanedGrantsDeleted).toBeGreaterThanOrEqual(1);
      expect(result.orphanedApplicationsDeleted).toBeGreaterThanOrEqual(1);

      // The grant goes only once its last token has, and never for a live
      // connection: rotation inserts the replacement before deleting the old
      // family, so a working grant is never momentarily tokenless.
      expect(await getGrantedAt(userId, expiredTokenClientId)).toBeNull();
      expect(await getGrantedAt(userId, liveTokenClientId)).not.toBeNull();

      const remainingTokens = await pool.query(
        `select access_token from mcp_oauth_access_tokens
         where access_token = any($1::text[])`,
        [[liveToken, refreshableToken]],
      );
      expect(remainingTokens.rowCount).toBe(2);

      const remainingClaims = await pool.query(
        `select 1 from mcp_oauth_consent_claims where consent_code_hash = $1`,
        [liveClaimHash],
      );
      expect(remainingClaims.rowCount).toBe(1);

      const remainingRefreshClaims = await pool.query(
        `select 1 from mcp_oauth_refresh_claims where refresh_token_hash = $1`,
        [liveRefreshClaimHash],
      );
      expect(remainingRefreshClaims.rowCount).toBe(1);

      const remainingApplications = await pool.query<{ client_id: string }>(
        `select client_id from mcp_oauth_applications where client_id = any($1::text[])`,
        [
          [
            expiredTokenClientId,
            liveTokenClientId,
            orphanedClientId,
            recentClientId,
          ],
        ],
      );
      const remainingClientIds = remainingApplications.rows.map(
        (row) => row.client_id,
      );
      expect(remainingClientIds).toEqual(
        expect.arrayContaining([
          expiredTokenClientId,
          liveTokenClientId,
          recentClientId,
        ]),
      );
      expect(remainingClientIds).not.toContain(orphanedClientId);
    });
  });
});
