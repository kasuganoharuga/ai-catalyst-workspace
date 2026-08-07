import {
  extractLabelValue,
  getSection,
  isSectionNonEmpty,
  nonEmptyListItems,
  sectionExists,
} from "@ai-catalyst/services/artifact/internal/markdown-sections";

import type {
  ValidationContext,
  ValidationContextResponse,
  ValidationRunResult,
  Validator,
} from "./types.js";

// Implements draftRules + submissionRules for Module 1 under
// program_versions v2 (founder-toolkit-v1). Section vocabulary matches
// PRESSURE_TEST_VERDICT_TEMPLATE in content-seed/content/module-1.ts.
// pressure_test_verdict_v1 remains registered for v1-module-0-1 content.

type HeadingLookup = { kind: "heading"; level: number; heading: string };
type LabelLookup = { kind: "label"; label: string };
type SectionLookup = HeadingLookup | LabelLookup;

const SECTION_LOOKUPS: Record<string, SectionLookup> = {
  confirmed_qa: { kind: "heading", level: 2, heading: "Confirmed Q&A" },
  ai_recommendation: {
    kind: "heading",
    level: 2,
    heading: "AI Recommendation",
  },
  failure_reasons: {
    kind: "heading",
    level: 2,
    heading: "Five Failure Reasons",
  },
  competitors_alternatives: {
    kind: "heading",
    level: 2,
    heading: "Competitors / Alternatives",
  },
  success_conditions: {
    kind: "heading",
    level: 2,
    heading: "Success Conditions",
  },
  investor_decision_section: {
    kind: "heading",
    level: 2,
    heading: "Investor Decision",
  },
  recommended_next_step: {
    kind: "heading",
    level: 2,
    heading: "Recommended Next Step",
  },
  founders_decision: {
    kind: "heading",
    level: 2,
    heading: "Founder's Decision",
  },
  single_biggest_reason: { kind: "label", label: "Single biggest reason" },
  evidence_note: { kind: "label", label: "Evidence note" },
  ai_recommendation_reason: { kind: "label", label: "Reason" },
};

const ENUM_RULE_LABELS: Record<string, string> = {
  investor_decision: "Decision",
  ai_recommendation: "Recommendation",
};

function sectionBody(content: string, sectionKey: string): string | null {
  const lookup = SECTION_LOOKUPS[sectionKey];
  if (!lookup) {
    return null;
  }
  return lookup.kind === "heading"
    ? getSection(content, lookup.level, lookup.heading)
    : extractLabelValue(content, lookup.label);
}

function sectionIsNonEmpty(content: string, sectionKey: string): boolean {
  const lookup = SECTION_LOOKUPS[sectionKey];
  if (!lookup) {
    return false;
  }
  if (lookup.kind === "heading") {
    return isSectionNonEmpty(content, lookup.level, lookup.heading);
  }
  const value = extractLabelValue(content, lookup.label);
  return value !== null && value.trim().length > 0;
}

function sectionHeadingExists(sectionKey: string, content: string): boolean {
  const lookup = SECTION_LOOKUPS[sectionKey];
  return lookup?.kind === "heading"
    ? sectionExists(content, lookup.level, lookup.heading)
    : false;
}

interface RuleCheck {
  key: string;
  passed: boolean;
  message?: string;
}

interface RawRule {
  key: string;
  type?: string;
  section?: string;
  expected?: number;
  minimum?: number;
  allowed?: string[];
  sections?: string[];
}

function asRuleArray(value: unknown): RawRule[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is RawRule =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as RawRule).key === "string",
  );
}

function getResponse(
  ctx: ValidationContext,
  questionKey: string,
): ValidationContextResponse | undefined {
  return ctx.responses.find((response) => response.questionKey === questionKey);
}

function isAnswered(response: ValidationContextResponse | undefined): boolean {
  return (
    response !== undefined &&
    response.responseStatus === "answered" &&
    (response.answerText ?? "").trim().length > 0
  );
}

function checkResponseCount(rule: RawRule, ctx: ValidationContext): RuleCheck {
  const expected = rule.expected ?? 0;
  const answeredCount = ctx.responses.filter((response) =>
    isAnswered(response),
  ).length;
  return {
    key: rule.key,
    passed: answeredCount >= expected,
    message:
      answeredCount >= expected
        ? undefined
        : `Expected at least ${expected} answered Responses, found ${answeredCount}.`,
  };
}

function checkListLength(rule: RawRule, ctx: ValidationContext): RuleCheck {
  const section = rule.section ?? "";
  const expected = rule.expected ?? 0;
  const body = sectionBody(ctx.content, section) ?? "";
  const count = nonEmptyListItems(body).length;
  return {
    key: rule.key,
    passed: count === expected,
    message:
      count === expected
        ? undefined
        : `Expected exactly ${expected} items in "${section}", found ${count}.`,
  };
}

function checkMinimumNamedItems(
  rule: RawRule,
  ctx: ValidationContext,
): RuleCheck {
  const section = rule.section ?? "";
  const minimum = rule.minimum ?? 0;
  const body = sectionBody(ctx.content, section) ?? "";
  const count = nonEmptyListItems(body).length;
  return {
    key: rule.key,
    passed: count >= minimum,
    message:
      count >= minimum
        ? undefined
        : `Expected at least ${minimum} items in "${section}", found ${count}.`,
  };
}

function checkSectionNonEmpty(
  rule: RawRule,
  ctx: ValidationContext,
): RuleCheck {
  const section = rule.section ?? "";
  const passed = sectionIsNonEmpty(ctx.content, section);
  return {
    key: rule.key,
    passed,
    message: passed ? undefined : `Section "${section}" is missing or empty.`,
  };
}

function checkEnum(rule: RawRule, ctx: ValidationContext): RuleCheck {
  const allowed = rule.allowed ?? [];
  const label = ENUM_RULE_LABELS[rule.key];
  const value = label ? extractLabelValue(ctx.content, label) : null;
  const normalized = value?.trim().toLowerCase() ?? "";
  // Accept "Proceed / Pivot / Kill" style placeholders by matching the
  // first allowed token present, or an exact single allowed value.
  const passed =
    allowed.includes(normalized) ||
    allowed.some(
      (option) => normalized === option || normalized.startsWith(`${option} `),
    );
  return {
    key: rule.key,
    passed,
    message: passed
      ? undefined
      : `Expected one of [${allowed.join(", ")}], found "${value ?? "(none)"}".`,
  };
}

function checkSectionsExist(rule: RawRule, ctx: ValidationContext): RuleCheck {
  const sections = rule.sections ?? [];
  const missing = sections.filter(
    (section) => !sectionHeadingExists(section, ctx.content),
  );
  return {
    key: rule.key,
    passed: missing.length === 0,
    message:
      missing.length === 0
        ? undefined
        : `Missing required sections: ${missing.join(", ")}.`,
  };
}

function runDraftRule(rule: RawRule, ctx: ValidationContext): RuleCheck {
  switch (rule.type) {
    case "response_count":
      return checkResponseCount(rule, ctx);
    case "list_length":
      return checkListLength(rule, ctx);
    case "minimum_named_items":
      return checkMinimumNamedItems(rule, ctx);
    case "section_non_empty":
      return checkSectionNonEmpty(rule, ctx);
    case "enum":
      return checkEnum(rule, ctx);
    case "sections_exist":
      return checkSectionsExist(rule, ctx);
    default:
      return {
        key: rule.key,
        passed: false,
        message: `Unknown draft rule type "${String(rule.type)}".`,
      };
  }
}

function runSubmissionRule(rule: RawRule, ctx: ValidationContext): RuleCheck {
  switch (rule.key) {
    case "founder_decision_present": {
      const passed = isAnswered(getResponse(ctx, "founder_decision"));
      return {
        key: rule.key,
        passed,
        message: passed ? undefined : "founder_decision has not been answered.",
      };
    }
    case "pivot_detail_when_pivot": {
      const founderDecision = getResponse(ctx, "founder_decision");
      if (
        (founderDecision?.answerText ?? "").trim().toLowerCase() !== "pivot"
      ) {
        return { key: rule.key, passed: true };
      }
      const passed = isAnswered(getResponse(ctx, "pivot_detail"));
      return {
        key: rule.key,
        passed,
        message: passed
          ? undefined
          : "founder_decision is pivot, but pivot_detail has not been answered.",
      };
    }
    default:
      return {
        key: rule.key,
        passed: false,
        message: `Unknown submission rule "${rule.key}".`,
      };
  }
}

function combineResults(checks: RuleCheck[]): ValidationRunResult {
  const issues = checks
    .filter((check) => !check.passed)
    .map((check) => check.message ?? `Check "${check.key}" failed.`);
  const passed = issues.length === 0;
  const score =
    checks.length === 0
      ? 100
      : Math.round(
          (checks.filter((check) => check.passed).length / checks.length) * 100,
        );
  return { checks, issues, warnings: [], passed, score };
}

function runDraftCheck(ctx: ValidationContext): ValidationRunResult {
  const config = ctx.validationConfig as { draftRules?: unknown };
  const rules = asRuleArray(config.draftRules);
  return combineResults(rules.map((rule) => runDraftRule(rule, ctx)));
}

function runOfficialCheck(ctx: ValidationContext): ValidationRunResult {
  const config = ctx.validationConfig as {
    draftRules?: unknown;
    submissionRules?: unknown;
  };
  const draftChecks = asRuleArray(config.draftRules).map((rule) =>
    runDraftRule(rule, ctx),
  );
  const submissionChecks = asRuleArray(config.submissionRules).map((rule) =>
    runSubmissionRule(rule, ctx),
  );
  return combineResults([...draftChecks, ...submissionChecks]);
}

export const pressureTestVerdictV2: Validator = {
  validatorKey: "pressure_test_verdict_v2",
  validatorVersion: "2.0.0",
  runDraftCheck,
  runOfficialCheck,
};
