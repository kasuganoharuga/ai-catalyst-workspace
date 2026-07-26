import { describe, expect, it } from "vitest";

import { ServiceError } from "@ai-catalyst/services/errors";

import { errorCopy } from "@/app/(app)/lib/copy";
import { founderMessageForServiceError } from "@/lib/service-error-copy";

/**
 * The point of this mapping is that a founder never reads a message
 * written for whoever is tailing the logs. These assert that property
 * directly rather than pinning exact wording, so the copy stays free to
 * change and the guarantee doesn't.
 */
describe("founderMessageForServiceError", () => {
  it("replaces the service's own wording rather than passing it through", () => {
    const error = new ServiceError(
      "RUN_MODULE_NOT_AVAILABLE",
      'Module is "locked" and cannot be started or resumed.',
    );
    const message = founderMessageForServiceError(error);

    expect(message).not.toBe(error.message);
    expect(message).not.toContain('"locked"');
  });

  it("falls back to the generic line for an unmapped code", () => {
    // Deliberately a code with no entry in the table.
    const error = new ServiceError(
      "INVITATION_ALREADY_PENDING",
      "An invitation is already pending for this email.",
    );

    expect(founderMessageForServiceError(error)).toBe(errorCopy.generic);
  });

  // camelCase field names and snake_case enum values are the two shapes
  // that most obviously read as "something leaked from the database".
  it("never leaks an identifier-looking token", () => {
    const codes = [
      "VALIDATION_ERROR",
      "NOT_FOUND",
      "FORBIDDEN",
      "UNAUTHENTICATED",
      "RUN_MODULE_NOT_AVAILABLE",
      "MODULE_NOT_READY_FOR_CONFIRMATION",
      "ATTEMPT_PENDING_REVIEW",
      "ATTEMPT_NOT_EDITABLE",
      "ATTEMPT_NOT_SUBMITTABLE",
      "ATTEMPT_RETRY_SOURCE_INVALID",
      "ATTEMPT_NOT_AWAITING_VALIDATION",
      "VALIDATOR_NOT_CONFIGURED",
      "STORAGE_CONTENT_CONFLICT",
      "STORAGE_OBJECT_NOT_WRITABLE",
      "STORAGE_OBJECT_NOT_DELETABLE",
      "INTERNAL_INVARIANT_ERROR",
    ] as const;

    for (const code of codes) {
      const message = founderMessageForServiceError(
        new ServiceError(
          code,
          "programRunModuleId must be a non-blank string.",
        ),
      );
      expect(message, code).not.toMatch(/[a-z]+_[a-z]+/);
      expect(message, code).not.toMatch(/\b[a-z]+[A-Z][a-zA-Z]*\b/);
      expect(message.length, code).toBeGreaterThan(0);
    }
  });
});
