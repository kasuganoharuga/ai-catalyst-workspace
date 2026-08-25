import { beforeEach, describe, expect, it, vi } from "vitest";

import { getEmailSender } from "@/lib/email";
import {
  invitationEmail,
  loginUrlFromEnv,
  sendInvitationEmail,
} from "@/lib/invitation-emails";
import { webLog } from "@/lib/web-logger";

vi.mock("@/lib/email", () => ({
  getEmailSender: vi.fn(),
}));

vi.mock("@/lib/web-logger", () => ({
  webLog: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

describe("invitationEmail", () => {
  const message = invitationEmail({
    to: "founder@example.com",
    loginUrl: "https://develop.aicatalyst.toruscap.vc",
    password: "temporary-pass",
  });

  it("is only the login page, account, and initial password", () => {
    expect(message.to).toBe("founder@example.com");
    expect(message.text).toBe(
      [
        "Login: https://develop.aicatalyst.toruscap.vc",
        "Account: founder@example.com",
        "Password: temporary-pass",
      ].join("\n"),
    );
  });

  it("keeps the password out of the subject", () => {
    expect(message.subject).not.toContain("temporary-pass");
    expect(message.subject).toBe("Your AI Catalyst account");
  });

  it("does not mention an invitation code or the register/pending path", () => {
    expect(message.text).not.toMatch(/code|register|pending/i);
  });

  it("is plain text only — there is no HTML template to render", () => {
    expect(message.html).toBeUndefined();
  });
});

describe("loginUrlFromEnv", () => {
  it("strips a trailing slash from AUTH_ISSUER_URL", () => {
    expect(
      loginUrlFromEnv({
        AUTH_ISSUER_URL: "https://develop.aicatalyst.toruscap.vc/",
      }),
    ).toBe("https://develop.aicatalyst.toruscap.vc");
  });
});

describe("sendInvitationEmail", () => {
  const enqueue = vi.fn();

  beforeEach(() => {
    enqueue.mockReset();
    vi.mocked(webLog.error).mockClear();
    vi.mocked(getEmailSender).mockReturnValue({ enqueue });
  });

  it("returns true when enqueue succeeds", async () => {
    enqueue.mockResolvedValue(undefined);
    await expect(
      sendInvitationEmail({
        to: "founder@example.com",
        loginUrl: "https://example.com",
        password: "pw",
      }),
    ).resolves.toBe(true);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(webLog.error).not.toHaveBeenCalled();
  });

  it("returns false and logs when enqueue fails, so create still succeeds", async () => {
    enqueue.mockRejectedValue(new Error("SES rejected the message"));
    await expect(
      sendInvitationEmail({
        to: "founder@example.com",
        loginUrl: "https://example.com",
        password: "pw",
      }),
    ).resolves.toBe(false);
    expect(webLog.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "web_invitation_email_failed",
        error_message: "SES rejected the message",
      }),
    );
  });
});
