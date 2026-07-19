import { ServiceError } from "@ai-catalyst/services/errors";

// Package-subpath (not relative `.js`) value import — Turbopack cannot
// resolve same-directory relative `.js` imports back to `.ts` when
// bundling apps/web (see mcp-auth/index.ts's header comment). Became
// load-bearing when PR 2.9's module status page started importing
// @ai-catalyst/services/artifact from apps/web.
import { pressureTestVerdictV1 } from "@ai-catalyst/services/artifact/internal/validators/pressure-test-verdict-v1";

import type { Validator } from "./types.js";

const VALIDATORS: Record<string, Validator> = {
  [pressureTestVerdictV1.validatorKey]: pressureTestVerdictV1,
};

/**
 * Resolves a Validator by `artifact_definitions.validator_key`.
 * `overrides` is a test-only DI seam (same pattern as
 * ModuleCatalogDependencies/StorageServiceDependencies) letting
 * artifact/index.db.test.ts register a fixture Validator without
 * touching the real content's registrations.
 *
 * Throws INTERNAL_INVARIANT_ERROR (never NOT_FOUND/VALIDATION_ERROR) when
 * unresolved — content has seeded a `validator_key` that no deployed
 * code registers here, which is a deployment inconsistency, not a normal
 * business error the caller can act on.
 */
export function resolveValidator(
  validatorKey: string,
  overrides?: Record<string, Validator>,
): Validator {
  const validator = overrides?.[validatorKey] ?? VALIDATORS[validatorKey];
  if (!validator) {
    throw new ServiceError(
      "INTERNAL_INVARIANT_ERROR",
      `No Validator is registered for validator_key "${validatorKey}".`,
    );
  }
  return validator;
}
