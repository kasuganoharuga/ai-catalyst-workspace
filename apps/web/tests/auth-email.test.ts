import { describe, expect, it } from "vitest";

import { assertEmailProviderAllowed } from "@/lib/email";
import { SIGN_IN_CODE_TTL_SECONDS, signInCodeEmail } from "@/lib/auth-emails";

describe("assertEmailProviderAllowed", () => {
  // The failure this guards against is silent: on noop the sign-in code is
  // discarded and logged instead of delivered, so users see a sign-in that
  // never completes while live codes accumulate in the server log.
  it("rejects noop when APP_ENV is a real environment", () => {
    for (const appEnv of ["staging", "production"]) {
      expect(() =>
        assertEmailProviderAllowed({ APP_ENV: appEnv, EMAIL_PROVIDER: "noop" }),
      ).toThrow(/EMAIL_PROVIDER=noop is not allowed/);
    }
  });

  it("rejects an absent EMAIL_PROVIDER in a real environment, since noop is the default", () => {
    expect(() => assertEmailProviderAllowed({ APP_ENV: "production" })).toThrow(
      /EMAIL_PROVIDER=noop is not allowed/,
    );
  });

  /**
   * `local` is the value this repo actually uses — .env.example and all three
   * services in infra/docker/docker-compose.yml set it. An earlier allow-list
   * here recognised only development/test and therefore threw at boot for
   * every local `next dev` and every compose `web` container, on the default
   * EMAIL_PROVIDER=noop, with both login flags still off. Hence the explicit
   * case.
   */
  it("allows noop for APP_ENV=local, the repo's own local convention", () => {
    expect(() =>
      assertEmailProviderAllowed({ APP_ENV: "local", EMAIL_PROVIDER: "noop" }),
    ).not.toThrow();
  });

  it("allows noop in development, test, and an unset environment", () => {
    for (const env of [
      { APP_ENV: "development", EMAIL_PROVIDER: "noop" },
      { APP_ENV: "test", EMAIL_PROVIDER: "noop" },
      { EMAIL_PROVIDER: "noop" },
      {},
    ]) {
      expect(() => assertEmailProviderAllowed(env)).not.toThrow();
    }
  });

  // Deny-list: an unrecognised environment name is allowed through rather than
  // blocking a boot. Opposite of isModuleResetAllowed, which hides the reset
  // tool when APP_ENV is unknown.
  it("allows noop for an environment name it does not recognise", () => {
    expect(() =>
      assertEmailProviderAllowed({
        APP_ENV: "preview",
        EMAIL_PROVIDER: "noop",
      }),
    ).not.toThrow();
  });

  it("allows ses everywhere", () => {
    expect(() =>
      assertEmailProviderAllowed({
        APP_ENV: "production",
        EMAIL_PROVIDER: "ses",
      }),
    ).not.toThrow();
  });

  /**
   * Deliberately ignores NODE_ENV, matching the "Runtime APP_ENV gate (not
   * NODE_ENV)" convention elsewhere in the app. `next build` runs with
   * NODE_ENV=production and no EMAIL_* configured, so inferring from NODE_ENV
   * would turn this guard into a build failure — and a staging image is a
   * production build too, so NODE_ENV cannot identify the deployment anyway.
   */
  it("ignores NODE_ENV, so a production build with no APP_ENV still passes", () => {
    expect(() =>
      assertEmailProviderAllowed({
        NODE_ENV: "production",
        EMAIL_PROVIDER: "noop",
      }),
    ).not.toThrow();
  });
});

describe("signInCodeEmail", () => {
  const message = signInCodeEmail({ to: "founder@example.com", otp: "123456" });

  it("addresses the recipient and carries the code in the body", () => {
    expect(message.to).toBe("founder@example.com");
    expect(message.text).toContain("123456");
  });

  // Subjects surface on lock screens and in notification previews, where
  // someone glancing at the phone would not need the inbox to read the code.
  it("keeps the code out of the subject", () => {
    expect(message.subject).not.toContain("123456");
  });

  it("states the expiry in minutes, matching the configured TTL", () => {
    expect(message.text).toContain(
      `${Math.round(SIGN_IN_CODE_TTL_SECONDS / 60)} minutes`,
    );
  });

  // Sent before the recipient is authenticated, so it must not confirm whether
  // an account exists or who it belongs to.
  it("says nothing about the account beyond the code", () => {
    expect(message.text).toMatch(/ignore this email/i);
    expect(message.text).not.toMatch(/founder@example\.com/);
  });

  it("is plain text only — there is no HTML template to render", () => {
    expect(message.html).toBeUndefined();
  });
});
