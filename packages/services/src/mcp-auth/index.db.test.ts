import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pool } from "@ai-catalyst/db";
import { createWebActorContext } from "@ai-catalyst/contracts/actor-context";

import { ServiceError } from "../errors.js";
import {
  checkAuthorizationCodeIsRedeemable,
  cleanupExpiredMcpOAuthState,
  getAuthorizableUserById,
  getMcpConnectionStatus,
  getOAuthClientByClientId,
  getPendingMcpConsentRequest,
  isValidPublicOAuthClientRecord,
  tryClaimConsentCode,
  verifyMcpBearerToken,
} from "./index.js";

/**
 * Integration tests against the real Postgres database (see
 * apps/web/tests/README.md for prerequisites). Named `*.db.test.ts` so
 * `test`'s `--exclude` skips it while `test:db` runs it.
 */
describe("mcp-auth service — database integration", () => {
  const idPrefix = `mcp-auth-test-${randomUUID()}`;
  const createdUserIds: string[] = [];
  const createdClientIds: string[] = [];
  const createdVerificationIdentifiers: string[] = [];
  const createdConsentClaimHashes: string[] = [];

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
        "https://claude.ai/callback",
        options.type ?? "public",
        options.disabled ?? false,
      ],
    );
    createdClientIds.push(clientId);
    return clientId;
  }

  async function createAccessToken(
    clientId: string,
    userId: string | null,
    options: { expired?: boolean; scopes?: string } = {},
  ): Promise<string> {
    const accessToken = newAccessToken();
    const refreshToken = newAccessToken();
    const expiresAt = options.expired
      ? new Date(Date.now() - 60_000)
      : new Date(Date.now() + 3_600_000);

    await pool.query(
      `insert into mcp_oauth_access_tokens
         (access_token, refresh_token, access_token_expires_at, refresh_token_expires_at, client_id, user_id, scopes)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        accessToken,
        refreshToken,
        expiresAt,
        new Date(Date.now() + 7 * 24 * 3_600_000),
        clientId,
        userId,
        options.scopes ?? "mcp:connect",
      ],
    );
    return accessToken;
  }

  async function createVerification(value: object, options: { expired?: boolean } = {}): Promise<string> {
    const identifier = newConsentCode();
    await pool.query(
      `insert into verifications (identifier, value, expires_at)
       values ($1, $2, $3)`,
      [
        identifier,
        JSON.stringify(value),
        options.expired ? new Date(Date.now() - 60_000) : new Date(Date.now() + 600_000),
      ],
    );
    createdVerificationIdentifiers.push(identifier);
    return identifier;
  }

  function hashConsentCodeForCleanup(consentCode: string): string {
    return createHash("sha256").update(consentCode, "utf8").digest("hex");
  }

  function createPkcePair(): { codeVerifier: string; codeChallenge: string } {
    const codeVerifier = randomFromAlphabet(ALPHANUMERIC, 64);
    const codeChallenge = createHash("sha256").update(codeVerifier, "utf8").digest("base64url");
    return { codeVerifier, codeChallenge };
  }

  afterAll(async () => {
    await pool.query("delete from mcp_oauth_access_tokens where client_id = any($1::text[])", [
      createdClientIds,
    ]);
    await pool.query("delete from mcp_oauth_consents where client_id = any($1::text[])", [
      createdClientIds,
    ]);
    await pool.query("delete from mcp_oauth_applications where client_id = any($1::text[])", [
      createdClientIds,
    ]);
    if (createdVerificationIdentifiers.length > 0) {
      await pool.query("delete from verifications where identifier = any($1::text[])", [
        createdVerificationIdentifiers,
      ]);
    }
    if (createdConsentClaimHashes.length > 0) {
      await pool.query(
        "delete from mcp_oauth_consent_claims where consent_code_hash = any($1::text[])",
        [createdConsentClaimHashes],
      );
    }
    await pool.query("delete from users where id = any($1::uuid[])", [createdUserIds]);
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
        scopes: ["mcp:connect"],
      });
    });

    it("rejects a malformed token without querying the database", async () => {
      await expect(verifyMcpBearerToken("not-a-real-token")).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
      });
    });

    it("rejects an unknown token", async () => {
      await expect(verifyMcpBearerToken(newAccessToken())).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
      });
    });

    it("rejects an expired token", async () => {
      const userId = await createUser("expired", "founder");
      const clientId = await createClient("expired");
      const token = await createAccessToken(clientId, userId, { expired: true });

      await expect(verifyMcpBearerToken(token)).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
      });
    });

    it("rejects a token whose client is disabled", async () => {
      const userId = await createUser("disabled-client", "founder");
      const clientId = await createClient("disabled-client", { disabled: true });
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
  });

  describe("getPendingMcpConsentRequest", () => {
    it("returns the pending request for the matching user", async () => {
      const userId = await createUser("consent-valid", "founder");
      const clientId = await createClient("consent-valid");
      const consentCode = await createVerification({
        clientId,
        redirectURI: "https://claude.ai/callback",
        scope: ["mcp:connect"],
        userId,
        authTime: Date.now(),
        requireConsent: true,
      });

      const pending = await getPendingMcpConsentRequest(consentCode, userId);

      expect(pending).toMatchObject({
        consentCode,
        clientId,
        redirectHost: "claude.ai",
        scopes: ["mcp:connect"],
      });
    });

    it("throws NOT_FOUND for a different user", async () => {
      const userId = await createUser("consent-owner", "founder");
      const otherUserId = await createUser("consent-other", "founder");
      const clientId = await createClient("consent-cross-user");
      const consentCode = await createVerification({
        clientId,
        redirectURI: "https://claude.ai/callback",
        scope: ["mcp:connect"],
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
        scope: ["mcp:connect"],
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
          scope: ["mcp:connect"],
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
      const clientId = await createClient("consent-disabled-client", { disabled: true });
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

    it("throws NOT_FOUND when the scope is not exactly mcp:connect", async () => {
      const userId = await createUser("consent-bad-scope", "founder");
      const clientId = await createClient("consent-bad-scope");
      const consentCode = await createVerification({
        clientId,
        redirectURI: "https://claude.ai/callback",
        scope: ["mcp:connect", "openid"],
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
        scope: ["mcp:connect"],
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
        scope: ["mcp:connect"],
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
          scope: ["mcp:connect"],
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
        scope: ["mcp:connect"],
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
        scope: ["mcp:connect"],
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
        scope: ["mcp:connect"],
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
      const clientId = await createClient("redeem-disabled-client", { disabled: true });
      const { codeVerifier, codeChallenge } = createPkcePair();
      const code = await createVerification({
        clientId,
        redirectURI: "https://claude.ai/callback",
        scope: ["mcp:connect"],
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
        scope: ["mcp:connect"],
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
        scope: ["mcp:connect"],
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
      expect(wrongVerifier).toMatchObject({ ok: false, error: "invalid_grant" });

      const rightVerifier = await checkAuthorizationCodeIsRedeemable({
        code,
        clientId,
        redirectUri: "https://claude.ai/callback",
        codeVerifier,
      });
      expect(rightVerifier).toEqual({ ok: true });
    });

    it("rejects a deleted user's code as invalid_grant", async () => {
      const userId = await createUser("redeem-deleted-user", "founder", { deleted: true });
      const clientId = await createClient("redeem-deleted-user");
      const { codeVerifier, codeChallenge } = createPkcePair();
      const code = await createVerification({
        clientId,
        redirectURI: "https://claude.ai/callback",
        scope: ["mcp:connect"],
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
        scope: ["mcp:connect"],
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

      expect(client).toMatchObject({ clientId, disabled: false, type: "public" });
      expect(isValidPublicOAuthClientRecord(client)).toBe(true);
    });

    it("returns null for an unknown client_id", async () => {
      const client = await getOAuthClientByClientId(`${idPrefix}-does-not-exist`);
      expect(client).toBeNull();
      expect(isValidPublicOAuthClientRecord(client)).toBe(false);
    });

    it("flags a disabled client as not a valid public client", async () => {
      const clientId = await createClient("lookup-disabled", { disabled: true });
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
    it("returns the user for an active, non-pending account", async () => {
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

    it("returns null for a deleted account", async () => {
      const userId = await createUser("authorizable-deleted", "founder", { deleted: true });
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
        getMcpConnectionStatus(createWebActorContext({ userId, role: "admin" })),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("reports never-connected for a founder with no tokens or consents", async () => {
      const userId = await createUser("conn-none", "founder");
      await expect(
        getMcpConnectionStatus(createWebActorContext({ userId, role: "founder" })),
      ).resolves.toEqual({
        connected: false,
        clientName: null,
        connectedAt: null,
        expiresAt: null,
        hasEverConnected: false,
      });
    });

    it("reports connected with client metadata for a live token", async () => {
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
      expect(status.connected).toBe(true);
      expect(status.clientName).toBe("Test Client conn-live");
      expect(status.hasEverConnected).toBe(true);
      expect(status.connectedAt).not.toBeNull();
      expect(new Date(status.expiresAt as string).getTime()).toBeGreaterThan(Date.now());
    });

    it("reports disconnected-but-previously-connected once every token has expired", async () => {
      const userId = await createUser("conn-expired", "founder");
      const clientId = await createClient("conn-expired");
      await createAccessToken(clientId, userId, { expired: true });
      await pool.query(
        `insert into mcp_oauth_consents (client_id, user_id, scopes, consent_given)
         values ($1, $2, 'mcp:connect', true)`,
        [clientId, userId],
      );

      await expect(
        getMcpConnectionStatus(createWebActorContext({ userId, role: "founder" })),
      ).resolves.toMatchObject({
        connected: false,
        clientName: null,
        hasEverConnected: true,
      });
    });

    it("ignores live tokens issued to a disabled client", async () => {
      const userId = await createUser("conn-disabled", "founder");
      const clientId = await createClient("conn-disabled", { disabled: true });
      await createAccessToken(clientId, userId);

      await expect(
        getMcpConnectionStatus(createWebActorContext({ userId, role: "founder" })),
      ).resolves.toMatchObject({ connected: false });
    });

    it("does not treat a consent_given=false record as ever-connected", async () => {
      const userId = await createUser("conn-denied", "founder");
      const clientId = await createClient("conn-denied");
      await pool.query(
        `insert into mcp_oauth_consents (client_id, user_id, scopes, consent_given)
         values ($1, $2, 'mcp:connect', false)`,
        [clientId, userId],
      );

      await expect(
        getMcpConnectionStatus(createWebActorContext({ userId, role: "founder" })),
      ).resolves.toMatchObject({ connected: false, hasEverConnected: false });
    });
  });

  // Deliberately the last describe block in this file: cleanupExpiredMcpOAuthState
  // deletes matching rows table-wide, not scoped to this test file's own
  // fixtures, so it must only ever run once every other test's assertions
  // against its own fixtures have already completed.
  describe("cleanupExpiredMcpOAuthState", () => {
    it("deletes expired access tokens, expired consent claims, and orphaned (never-consented, past the grace period) applications", async () => {
      const userId = await createUser("cleanup", "founder");

      const expiredTokenClientId = await createClient("cleanup-expired-token");
      await createAccessToken(expiredTokenClientId, userId, { expired: true });

      const liveTokenClientId = await createClient("cleanup-live-token");
      const liveToken = await createAccessToken(liveTokenClientId, userId);

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

      const result = await cleanupExpiredMcpOAuthState();

      expect(result.expiredAccessTokensDeleted).toBeGreaterThanOrEqual(1);
      expect(result.expiredConsentClaimsDeleted).toBeGreaterThanOrEqual(1);
      expect(result.orphanedApplicationsDeleted).toBeGreaterThanOrEqual(1);

      const remainingTokens = await pool.query(
        `select access_token from mcp_oauth_access_tokens where access_token = $1`,
        [liveToken],
      );
      expect(remainingTokens.rowCount).toBe(1);

      const remainingClaims = await pool.query(
        `select 1 from mcp_oauth_consent_claims where consent_code_hash = $1`,
        [liveClaimHash],
      );
      expect(remainingClaims.rowCount).toBe(1);

      const remainingApplications = await pool.query<{ client_id: string }>(
        `select client_id from mcp_oauth_applications where client_id = any($1::text[])`,
        [[expiredTokenClientId, liveTokenClientId, orphanedClientId, recentClientId]],
      );
      const remainingClientIds = remainingApplications.rows.map((row) => row.client_id);
      expect(remainingClientIds).toEqual(
        expect.arrayContaining([expiredTokenClientId, liveTokenClientId, recentClientId]),
      );
      expect(remainingClientIds).not.toContain(orphanedClientId);
    });
  });
});
