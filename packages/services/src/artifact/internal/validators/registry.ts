import { ServiceError } from "@ai-catalyst/services/errors";

// Package subpath import for Turbopack resolution when apps/web bundles services.
import { pressureTestVerdictV1 } from "@ai-catalyst/services/artifact/internal/validators/pressure-test-verdict-v1";
import { pressureTestVerdictV2 } from "@ai-catalyst/services/artifact/internal/validators/pressure-test-verdict-v2";
import { structuredMarkdownV1 } from "@ai-catalyst/services/artifact/internal/validators/structured-markdown-v1";

import type { Validator } from "./types.js";

const VALIDATORS: Record<string, Validator> = {
  [pressureTestVerdictV1.validatorKey]: pressureTestVerdictV1,
  [pressureTestVerdictV2.validatorKey]: pressureTestVerdictV2,
  [structuredMarkdownV1.validatorKey]: structuredMarkdownV1,
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
