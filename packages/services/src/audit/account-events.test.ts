import { afterEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@ai-catalyst/contracts/actor-context";

import { recordAccountEvent } from "./account-events.js";

const ADMIN_USER_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_USER_ID = "22222222-2222-4222-8222-222222222222";

const admin: ActorContext = { userId: ADMIN_USER_ID, role: "admin" };

/** Both sinks: the logger sends info to console.log and errors to console.error. */
function captureLogs(): () => string {
  const lines: string[] = [];
  const collect = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  vi.spyOn(console, "log").mockImplementation(collect);
  vi.spyOn(console, "info").mockImplementation(collect);
  return () => lines.join("\n");
}

describe("recordAccountEvent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits the event name and the ids needed to resolve it later", () => {
    const read = captureLogs();

    recordAccountEvent("account_password_reset_by_admin", {
      actor: admin,
      targetUserId: TARGET_USER_ID,
    });

    const output = read();
    expect(output).toContain("account_password_reset_by_admin");
    expect(output).toContain(ADMIN_USER_ID);
    expect(output).toContain(TARGET_USER_ID);
  });

  it("writes ids only — a fully populated event carries no address", () => {
    const read = captureLogs();

    // Every field the type allows, all populated: if someone later widens
    // `AccountAuditFields` with an email-bearing field and a call site fills
    // it, this assertion is what fails. Redaction alone would not catch it —
    // packages/observability matches denied *key names* (`email`, `phone`),
    // so an address reaching the output under any other key is written
    // verbatim. Keeping the field set id-only is the actual guarantee.
    recordAccountEvent("account_invitation_accepted", {
      actor: admin,
      targetUserId: TARGET_USER_ID,
      invitationId: "33333333-3333-4333-8333-333333333333",
      inviteRole: "founder",
      workspaceId: "44444444-4444-4444-8444-444444444444",
      mentorUserId: "55555555-5555-4555-8555-555555555555",
    });

    expect(read()).not.toContain("@");
  });
});
