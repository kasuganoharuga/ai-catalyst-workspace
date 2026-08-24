import { beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceError } from "@ai-catalyst/services/errors";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";

import { errorCopy } from "@/app/(app)/lib/copy";
import { webLog } from "@/lib/web-logger";
import {
  founderActionResult,
  internalActionResult,
} from "@/lib/actions/action-error";
import { isActorAllowed } from "@/lib/actions/require-actor";

vi.mock("@/lib/web-logger", () => ({
  webLog: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// require-actor.ts imports auth at module scope so require*Actor can call
// getSession. isActorAllowed itself never touches it, but the import still
// evaluates lib/auth.ts, which throws without AUTH_ISSUER_URL. Packages CI
// does not set that env (only Frontend / infra jobs do), so stub the module
// the same way webLog is stubbed above.
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

function actor(overrides: Partial<ActorContext>): ActorContext {
  return { userId: "u1", role: "founder", source: "web", ...overrides };
}

describe("isActorAllowed", () => {
  it("passes a real Founder against a founder-only gate", () => {
    expect(isActorAllowed(actor({ role: "founder" }), ["founder"])).toBe(true);
  });

  it("passes a previewing Mentor against a founder-only gate", () => {
    // effectiveRole reads actingAs first — this is requireFounderActor's
    // whole reason for existing.
    expect(
      isActorAllowed(actor({ role: "mentor", actingAs: "founder" }), [
        "founder",
      ]),
    ).toBe(true);
  });

  it("rejects a non-previewing Mentor against a founder-only gate", () => {
    expect(isActorAllowed(actor({ role: "mentor" }), ["founder"])).toBe(false);
  });

  // The property requireRealMentorActor exists to route around: a Mentor
  // actor carrying actingAs: "founder" fails a raw "mentor" gate, because
  // effectiveRole reads "founder", not "mentor". requireRealMentorActor
  // never lets this situation arise in the first place — it asks for a
  // previewAware: false actor, which never has actingAs set at all — but
  // this asserts the predicate itself would trip on it if it did.
  it("rejects a previewing Mentor against a real-mentor-only gate", () => {
    expect(
      isActorAllowed(actor({ role: "mentor", actingAs: "founder" }), [
        "mentor",
      ]),
    ).toBe(false);
  });

  it("passes a pending account only against a pending gate", () => {
    expect(isActorAllowed(actor({ role: "pending" }), ["pending"])).toBe(true);
    expect(isActorAllowed(actor({ role: "pending" }), ["founder"])).toBe(false);
  });

  it("passes Founder, Mentor, or Admin against the account gate", () => {
    for (const role of ["founder", "mentor", "admin"] as const) {
      expect(
        isActorAllowed(actor({ role }), ["founder", "mentor", "admin"]),
      ).toBe(true);
    }
    expect(
      isActorAllowed(actor({ role: "pending" }), [
        "founder",
        "mentor",
        "admin",
      ]),
    ).toBe(false);
  });
});

describe("founderActionResult", () => {
  beforeEach(() => {
    vi.mocked(webLog.error).mockClear();
  });

  it("maps a ServiceError through founderMessageForServiceError, not its raw message", () => {
    const toActionResult = founderActionResult({ domain: "founder" });
    const error = new ServiceError(
      "RUN_MODULE_NOT_AVAILABLE",
      'Module is "locked" and cannot be started or resumed.',
    );

    const result = toActionResult(error);

    expect(result.ok).toBe(false);
    expect(result.message).not.toBe(error.message);
    expect(result.message).not.toContain("locked");
  });

  it("logs the real code and detail for a ServiceError — the read-real/show-mapped split", () => {
    const toActionResult = founderActionResult({ domain: "founder" });
    const error = new ServiceError("NOT_FOUND", "Workspace 123 not found.");

    toActionResult(error);

    expect(webLog.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "web_service_action_error",
        code: "NOT_FOUND",
        detail: "Workspace 123 not found.",
      }),
    );
  });

  it("falls back to errorCopy.generic for an unmapped code, by default", () => {
    const toActionResult = founderActionResult({ domain: "founder" });
    // Deliberately a code with no entry in founderMessageForServiceError's table.
    const error = new ServiceError(
      "INVITATION_ALREADY_PENDING",
      "An invitation is already pending for this email.",
    );

    expect(toActionResult(error).message).toBe(errorCopy.generic);
  });

  it("uses a caller-supplied genericMessage instead of errorCopy.generic", () => {
    const toActionResult = founderActionResult({
      domain: "account",
      genericMessage: "That didn't save. Try again in a moment.",
    });

    const result = toActionResult(new Error("boom"));

    expect(result.message).toBe("That didn't save. Try again in a moment.");
  });

  it("overrides the event names when a caller supplies them", () => {
    const toActionResult = founderActionResult({
      domain: "prep",
      event: "web_prep_action_error",
      unhandledEvent: "web_unhandled_prep_action_error",
    });

    toActionResult(new ServiceError("VALIDATION_ERROR", "bad input"));
    expect(webLog.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "web_prep_action_error" }),
    );

    toActionResult(new Error("boom"));
    expect(webLog.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "web_unhandled_prep_action_error" }),
    );
  });

  it("never lets a bare Error's message reach the response", () => {
    const toActionResult = founderActionResult({ domain: "founder" });
    const result = toActionResult(new Error("boom, leaked stack trace info"));

    expect(result.message).not.toContain("boom");
  });
});

describe("internalActionResult", () => {
  beforeEach(() => {
    vi.mocked(webLog.error).mockClear();
  });

  it("returns a ServiceError's own message verbatim", () => {
    const toActionResult = internalActionResult({ domain: "admin" });
    const error = new ServiceError(
      "VALIDATION_ERROR",
      "Email must be a valid address.",
    );

    expect(toActionResult(error)).toEqual({
      ok: false,
      message: "Email must be a valid address.",
    });
  });

  // The regression this guards: admin/mentor surfaces are read by whoever
  // operates the platform, so a ServiceError is expected, named, and
  // already informative — logging it too would just be noise. Routing an
  // admin-facing action through founderActionResult by mistake would start
  // logging (and translating) messages meant to be read as-is.
  it("does not log a ServiceError", () => {
    const toActionResult = internalActionResult({ domain: "admin" });
    toActionResult(new ServiceError("NOT_FOUND", "Invitation not found."));

    expect(webLog.error).not.toHaveBeenCalled();
  });

  it("logs and returns a generic message for an unhandled error", () => {
    const toActionResult = internalActionResult({ domain: "mentor" });
    const result = toActionResult(new Error("boom"));

    expect(result).toEqual({ ok: false, message: "Something went wrong." });
    expect(webLog.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "web_unhandled_action_error",
        message: "Unhandled mentor server action error",
      }),
    );
  });

  it("never lets a bare Error's message reach the response", () => {
    const toActionResult = internalActionResult({ domain: "admin" });
    const result = toActionResult(new Error("boom, leaked stack trace info"));

    expect(result.message).not.toContain("boom");
  });
});
