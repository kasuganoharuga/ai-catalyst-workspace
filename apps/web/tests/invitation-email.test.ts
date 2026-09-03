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

  it("carries the login page, account, and initial password", () => {
    expect(message.to).toBe("founder@example.com");
    expect(message.text).toContain(
      "Login: https://develop.aicatalyst.toruscap.vc",
    );
    expect(message.text).toContain("Account: founder@example.com");
    expect(message.text).toContain("Password: temporary-pass");
  });

  // inviteWithCredentials creates the account and accepts the invitation
  // before this send, so there is no step left for the recipient to complete.
  it("says the account is usable immediately", () => {
    expect(message.text).toMatch(/sign in straight away/i);
  });

  // The app makes the change mandatory (onboarding PasswordStep, then the
  // no-skip dashboard PasswordPrompt); the email supplies the reason, which
  // is the part only the email can give — this password sits in an inbox.
  it("tells the recipient to replace the password once they are in", () => {
    expect(message.text).toMatch(/change this password once you're in/i);
    expect(message.text).toMatch(/travelled by email/i);
  });

  it("keeps the password out of the subject", () => {
    expect(message.subject).not.toContain("temporary-pass");
    expect(message.subject).toBe("Your AI Catalyst account");
  });

  it("does not mention an invitation code or the register/pending path", () => {
    expect(message.text).not.toMatch(/code|register|pending/i);
  });

  describe("html part", () => {
    const html = message.html ?? "";

    it("carries the same three facts as the text part", () => {
      expect(html).toContain("https://develop.aicatalyst.toruscap.vc");
      expect(html).toContain("founder@example.com");
      expect(html).toContain("temporary-pass");
    });

    // The text part is the canonical body; the html part is the same facts
    // in the brand shell. Anything only one of them says is drift.
    it("adds no information the text part lacks", () => {
      expect(html).not.toMatch(/code|register|pending/i);
    });

    it("links the login page and the call to action at the login URL", () => {
      expect(html).toContain('href="https://develop.aicatalyst.toruscap.vc"');
      expect(html).toContain("Sign in now");
    });

    it("repeats the password reminder the text part carries", () => {
      expect(html).toContain("Change this password once you&#39;re in.");
      expect(html).toContain("travelled by email");
    });

    /**
     * Mail clients resolve href="" against their own document, so an empty
     * AUTH_ISSUER_URL would send the reader to wherever the preview is
     * hosted rather than to the app. Both the row link and the CTA drop out.
     */
    it("emits no link at all when the login URL is unset", () => {
      const noUrl = invitationEmail({
        to: "founder@example.com",
        loginUrl: "",
        password: "temporary-pass",
      });
      expect(noUrl.html).not.toContain("<a ");
      expect(noUrl.html).not.toContain("Sign in now");
      // The reminder is not tied to the CTA — losing the button must not
      // lose the one instruction the recipient has to act on themselves.
      expect(noUrl.html).toContain("travelled by email");
    });

    // Escaped before interpolation: the address comes from whoever filled in
    // the invite form, and the password is generated.
    it("escapes values into the markup", () => {
      const escaped = invitationEmail({
        to: "a<b>@example.com",
        loginUrl: "https://example.com/?a=1&b=2",
        password: 'p"&<x',
      });
      expect(escaped.html).not.toContain("a<b>@example.com");
      expect(escaped.html).toContain("a&lt;b&gt;@example.com");
      expect(escaped.html).toContain("p&quot;&amp;&lt;x");
      expect(escaped.html).toContain('href="https://example.com/?a=1&amp;b=2"');
    });

    // Word-engine Outlook drops flex/grid and ignores padding on <div>, and
    // Gmail strips <style> blocks from the clipped-message view.
    it("is table-based with inlined styles only", () => {
      expect(html).toContain('role="presentation"');
      expect(html).not.toContain("<style");
      expect(html).not.toMatch(/display:\s*(flex|grid)/);
    });

    // Image blocking is the default in Outlook and in Gmail for unknown
    // senders, so a logo would render as a grey placeholder box.
    it("loads nothing remote", () => {
      expect(html).not.toContain("<img");
      expect(html).not.toContain("<link");
      expect(html).not.toContain("url(");
    });
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
