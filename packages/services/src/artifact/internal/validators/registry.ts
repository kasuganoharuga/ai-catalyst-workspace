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

/** Resolves by `validator_key`; `overrides` is test-only DI. Unresolved keys throw INTERNAL_INVARIANT_ERROR — seeded content without a deployed Validator is a deployment bug, not a caller-facing validation error. */
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
