import { ServiceError } from "@ai-catalyst/services/errors";

// Pure condition/option parsing helpers for saveFounderResponse — no `pg`
// import, so this is directly unit-testable offline (see
// response-value.test.ts).

export interface ParsedQuestionCondition {
  depends_on: string;
  operator: "equals";
  value: unknown;
}

// An empty `{}` (module_questions.conditions' default) is not a condition
// at all — only a well-formed `{ depends_on, operator: "equals", value }`
// object counts as "this question has conditions".
export function parseNonEmptyConditions(
  conditions: unknown,
): ParsedQuestionCondition | null {
  if (typeof conditions !== "object" || conditions === null) {
    return null;
  }
  if (Object.keys(conditions).length === 0) {
    return null;
  }
  const { depends_on, operator, value } = conditions as {
    depends_on?: unknown;
    operator?: unknown;
    value?: unknown;
  };
  if (typeof depends_on !== "string" || operator !== "equals") {
    return null;
  }
  return { depends_on, operator, value };
}

export function listOptionValues(options: unknown): string[] {
  if (!Array.isArray(options)) {
    return [];
  }
  const values: string[] = [];
  for (const option of options) {
    if (
      typeof option === "object" &&
      option !== null &&
      typeof (option as { value?: unknown }).value === "string"
    ) {
      values.push((option as { value: string }).value);
    }
  }
  return values;
}

export function optionsInclude(options: unknown, value: string): boolean {
  return listOptionValues(options).includes(value);
}

export const SINGLE_CHOICE_WRAPPER_KEYS = [
  "value",
  "answer",
  "selection",
] as const;

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Resolves a single_choice payload against this question's allowed options
 * only — never a cross-module token whitelist. Conservative coercion covers
 * common model format mistakes without swallowing arbitrary schema bugs.
 */
export function resolveSingleChoiceValue(
  questionKey: string,
  options: unknown,
  value: unknown,
): string {
  const allowedOptions = listOptionValues(options);
  const allowedList =
    allowedOptions.length > 0
      ? allowedOptions.map((option) => `"${option}"`).join(", ")
      : "(none configured)";

  const reject = (): never => {
    throw new ServiceError(
      "VALIDATION_ERROR",
      `Question "${questionKey}" requires a value matching one of its options: ${allowedList}.`,
    );
  };

  if (allowedOptions.length === 0) {
    return reject();
  }

  // 1. Exact string option.
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (optionsInclude(options, trimmed)) {
      return trimmed;
    }

    // 3. Text/envelope contains exactly one unambiguous allowed option.
    const matches = allowedOptions.filter((option) => {
      const pattern = new RegExp(
        `(^|[^A-Za-z0-9_])${escapeRegExp(option)}([^A-Za-z0-9_]|$)`,
        "i",
      );
      return pattern.test(trimmed);
    });
    if (matches.length === 1) {
      return matches[0];
    }
    return reject();
  }

  // 2. Known wrapper fields only — do not deep-scan arbitrary objects.
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const key of SINGLE_CHOICE_WRAPPER_KEYS) {
      const wrapped = record[key];
      if (typeof wrapped === "string") {
        const trimmed = wrapped.trim();
        if (optionsInclude(options, trimmed)) {
          return trimmed;
        }
      }
    }
  }

  return reject();
}
