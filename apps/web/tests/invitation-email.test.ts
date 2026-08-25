import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Invitation } from "@ai-catalyst/shared";

import { getEmailSender } from "@/lib/email";
import { invitationEmail, sendInvitationEmail } from "@/lib/invitation-emails";
import { webLog } from "@/lib/web-logger";

vi.mock("@/lib/email", () => ({
  getEmailSender: vi.fn(),
}));

vi.mock("@/lib/web-logger", () => ({
  webLog: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const invitation: Invitation = {
  id: "inv-1",
  email: "founder@example.com",
  inviteRole: "founder",
  workspaceId: null,
  status: "pending",
  invitedByUserId: "admin-1",
  personalMessage: null,
  expiresAt: "2026-09-01T00:00:00.000Z",
  acceptedAt: null,
  revokedAt: null,
  createdAt: "2026-08-25T00:00:00.000Z",
  updatedAt: "2026-08-25T00:00:00.000Z",
};

describe("invitationEmail", () => {
  const message = invitationEmail({
    to: "founder@example.com",
    inviteRole: "founder",
    token: "one-time-code",
    expiresAt: "2026-09-01T00:00:00.000Z",
    origin: "https://develop.aicatalyst.toruscap.vc",
  });

  it("addresses the recipient and carries the code in the body", () => {
    expect(message.to).toBe("founder@example.com");
    expect(message.text).toContain("one-time-code");
  });

  it("keeps the code out of the subject", () => {
    expect(message.subject).not.toContain("one-time-code");
    expect(message.subject).toContain("Founder");
  });

  it("points at register and the awaiting-invitation page", () => {
    expect(message.text).toContain(
      "https://develop.aicatalyst.toruscap.vc/register",
    );
    expect(message.text).toContain(
      "https://develop.aicatalyst.toruscap.vc/pending",
    );
  });

  it("includes a personal message when one was supplied", () => {
    const withNote = invitationEmail({
      to: "founder@example.com",
      inviteRole: "mentor",
      token: "abc",
      expiresAt: "2026-09-01T00:00:00.000Z",
      personalMessage: "Looking forward to working together.",
    });
    expect(withNote.text).toContain("Looking forward to working together.");
    expect(withNote.subject).toContain("Mentor");
  });

  it("is plain text only — there is no HTML template to render", () => {
    expect(message.html).toBeUndefined();
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
    await expect(sendInvitationEmail(invitation, "token-1")).resolves.toBe(
      true,
    );
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(webLog.error).not.toHaveBeenCalled();
  });

  it("returns false and logs when enqueue fails, so create still succeeds", async () => {
    enqueue.mockRejectedValue(new Error("SES rejected the message"));
    await expect(sendInvitationEmail(invitation, "token-1")).resolves.toBe(
      false,
    );
    expect(webLog.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "web_invitation_email_failed",
      }),
    );
  });
});
