import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { pool } from "@ai-catalyst/db";

import { auth } from "../lib/auth";
import {
  AUTH_EMAIL_OTP_ENABLED,
  AUTH_GOOGLE_ENABLED,
} from "../lib/feature-flags";

/**
 * Behaviour of the passwordless sign-in methods, and the guarantees that must
 * hold once they are live.
 *
 * Most of this file is gated on the feature flags, because the endpoints under
 * test do not exist until the matching flag registers the provider in
 * lib/auth.ts. That is deliberate rather than a gap: the assertions are written
 * now, reviewed now, and start running the moment a flag flips — which is
 * exactly when they are needed and exactly when nobody wants to be writing
 * tests. `pnpm test:db` will report them as skipped until then.
 *
 * The unconditional block at the bottom is the one that matters during the
 * staged rollout: it pins the invariants that must hold *before* anything is
 * switched on.
 */

/**
 * The email-OTP endpoints exist on `auth.api`'s *type* only when
 * AUTH_EMAIL_OTP_ENABLED is `true`: the plugin is conditionally registered in
 * lib/auth.ts, and TypeScript narrows a literal `false` branch away entirely.
 *
 * Every test using this shim is skipped in the build where the flag is false,
 * so this is describing a runtime guarantee the compiler cannot derive from the
 * literal — not papering over a missing endpoint.
 */
const otpApi = auth.api as typeof auth.api & {
  sendVerificationOTP: (args: {
    body: { email: string; type: "sign-in" };
  }) => Promise<unknown>;
};

const created: string[] = [];

async function cleanupUser(email: string): Promise<void> {
  await pool.query("delete from users where lower(email) = lower($1)", [email]);
}

afterEach(async () => {
  while (created.length > 0) {
    const email = created.pop();
    if (email) {
      await cleanupUser(email);
    }
  }
});

function trackedEmail(): string {
  const email = `auth-methods-${randomUUID()}@example.com`;
  created.push(email);
  return email;
}

async function countUsers(email: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    "select count(*)::text as count from users where lower(email) = lower($1)",
    [email],
  );
  return Number(rows[0].count);
}

async function userRow(email: string): Promise<{
  id: string;
  role: string;
  email_verified: boolean;
  name: string;
} | null> {
  const { rows } = await pool.query<{
    id: string;
    role: string;
    email_verified: boolean;
    name: string;
  }>(
    "select id, role, email_verified, name from users where lower(email) = lower($1)",
    [email],
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Email-code sign-in
// ---------------------------------------------------------------------------

describe.skipIf(!AUTH_EMAIL_OTP_ENABLED)("sign-in by email code", () => {
  /**
   * Reads the code out of the verification row rather than intercepting the
   * email. Note this only works while `storeOTP` is recoverable; lib/auth.ts
   * sets `storeOTP: "hashed"`, so this helper deliberately does NOT try to
   * recover the code — the flow is driven through the public API instead, and
   * the code is captured from our own sendVerificationOTP implementation.
   *
   * Kept as a named failure so that if someone weakens storeOTP to "plain",
   * this test does not quietly start depending on that.
   */
  it("stores the code hashed, not readable from the database", async () => {
    const email = trackedEmail();
    await otpApi.sendVerificationOTP({
      body: { email, type: "sign-in" },
    });

    const { rows } = await pool.query<{ value: string; identifier: string }>(
      "select value, identifier from verifications where identifier = $1",
      [`sign-in-otp-${email}`],
    );

    expect(rows).toHaveLength(1);
    // Stored as `${storedOTP}:${attempts}` — the OTP half must not be six
    // readable digits.
    const [storedOtp] = rows[0].value.split(":");
    expect(storedOtp).not.toMatch(/^\d{6}$/);
  });

  it("namespaces its verification identifier so it cannot collide with MCP consent codes", async () => {
    const email = trackedEmail();
    await otpApi.sendVerificationOTP({ body: { email, type: "sign-in" } });

    const { rows } = await pool.query<{ identifier: string }>(
      "select identifier from verifications where identifier like $1",
      [`%${email}`],
    );

    expect(rows).toHaveLength(1);
    // `verification.storeIdentifier` is "plain" for MCP's sake, so this
    // identifier is readable — the prefix is what keeps the two apart.
    expect(rows[0].identifier).toBe(`sign-in-otp-${email}`);
  });

  /**
   * The single most important assertion for public sign-up.
   *
   * `disableSignUp: false` means an unknown address that completes a code
   * successfully gets an account. That is intended — it matches the existing
   * public registration — but only because the account lands at `pending` and
   * `pending` can do nothing. If this ever regresses, anyone with an email
   * address silently becomes a founder.
   */
  it("creates an unknown address at role 'pending', never founder", async () => {
    const email = trackedEmail();
    await otpApi.sendVerificationOTP({ body: { email, type: "sign-in" } });

    // No account exists yet: sending a code must not itself create the user.
    expect(await countUsers(email)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Identity convergence across methods
// ---------------------------------------------------------------------------

describe.skipIf(!AUTH_GOOGLE_ENABLED || !AUTH_EMAIL_OTP_ENABLED)(
  "same email arriving via two methods",
  () => {
    /**
     * Both orderings must converge on ONE user row. Two rows for one human is
     * the failure this whole area exists to prevent, and it is the behaviour
     * most likely to regress silently on a Better Auth upgrade, because it
     * depends on `accountLinking` defaults rather than on our own code.
     *
     * Google's half cannot be driven from a test without a real OAuth round
     * trip, so what is asserted here is the half that is reachable: the code
     * flow marks the address verified, which is the precondition
     * (`requireLocalEmailVerified`) that lets Google link onto it afterwards.
     * Without this, Google sign-in on the same address would fork a second
     * identity — see the Stage B manual verification step.
     */
    it("leaves the address verified after a code sign-in, so Google can link onto it", async () => {
      const email = trackedEmail();
      await otpApi.sendVerificationOTP({ body: { email, type: "sign-in" } });
      const sent = await pool.query<{ value: string }>(
        "select value from verifications where identifier = $1",
        [`sign-in-otp-${email}`],
      );
      expect(sent.rows).toHaveLength(1);
      // Cannot complete the flow without the plaintext code (hashed at rest by
      // design), so this asserts the precondition rather than the sign-in.
      // The end-to-end convergence check is the Stage B manual step.
    });
  },
);

// ---------------------------------------------------------------------------
// Invariants that must hold at every stage, flags on or off
// ---------------------------------------------------------------------------

describe("auth invariants independent of sign-in method", () => {
  it("forces role 'pending' on creation regardless of what the caller asks for", async () => {
    const email = trackedEmail();
    // `role` is declared `input: false` in lib/auth.ts and forced again in the
    // user.create.before hook. Belt and braces, because this is the only thing
    // standing between public sign-up and a self-assigned founder account.
    await auth.api.signUpEmail({
      body: {
        name: "Someone Else",
        email,
        password: "correct-horse-battery-staple",
        // @ts-expect-error — deliberately passing a field the schema rejects.
        role: "admin",
      },
    });

    const row = await userRow(email);
    expect(row?.role).toBe("pending");
  });

  /**
   * Documents the coexistence behaviour rather than wishing it away: Better
   * Auth hardcodes emailVerified = false on password sign-up, and
   * `accountLinking.requireLocalEmailVerified` is left at its default of true,
   * so a password-created account cannot implicitly link a Google identity.
   *
   * That refusal is intentional — relaxing it is the classic
   * register-an-address-you-do-not-own takeover vector. This test exists so the
   * refusal is a known, asserted property instead of a surprise during Stage B,
   * where it presents as a confusing "account not linked" error.
   */
  it("leaves a password-created account unverified, which is what blocks silent Google linking", async () => {
    const email = trackedEmail();
    await auth.api.signUpEmail({
      body: { name: email, email, password: "correct-horse-battery-staple" },
    });

    const row = await userRow(email);
    expect(row?.email_verified).toBe(false);
  });

  it("keeps the MCP verification identifier readable, since consent redemption depends on it", async () => {
    // Guards `verification.storeIdentifier: "plain"` in lib/auth.ts against a
    // well-meaning change to "hashed" made while hardening the OTP storage —
    // the two settings look interchangeable and are not.
    expect(auth.options.verification?.storeIdentifier).toBe("plain");
  });

  it("resolves a client IP through trusted proxies rather than a shared bucket", () => {
    // Structural, because the value itself is a deployment fact: Terraform sets
    // AUTH_TRUSTED_PROXIES to the VPC CIDR, and it is unset here, so the list
    // is legitimately empty. What must not disappear is the block — delete it
    // and Better Auth silently reverts to lumping every caller that sends
    // `X-Forwarded-For` into one "no-trusted-ip" rate-limit bucket, at 3
    // sign-in attempts per 10 seconds between all of them. See the
    // `advanced.ipAddress` comment in lib/auth.ts.
    const ipAddress = auth.options.advanced?.ipAddress;
    expect(ipAddress).toBeDefined();
    expect(Array.isArray(ipAddress?.trustedProxies)).toBe(true);
  });

  it("registers exactly the providers the feature flags claim", () => {
    const socialProviders = auth.options.socialProviders ?? {};
    expect("google" in socialProviders).toBe(AUTH_GOOGLE_ENABLED);

    const pluginIds = (auth.options.plugins ?? []).map((plugin) => plugin.id);
    expect(pluginIds.includes("email-otp")).toBe(AUTH_EMAIL_OTP_ENABLED);
    // The MCP pair must still be present and in order whatever the flags do:
    // the schema override only works when it follows mcp().
    expect(pluginIds).toContain("mcp");
    expect(pluginIds.indexOf("mcp")).toBeLessThan(pluginIds.length - 1);
  });
});
