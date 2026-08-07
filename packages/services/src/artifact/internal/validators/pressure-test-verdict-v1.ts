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

// Implements draftRules + submissionRules from module-1 content seed validationConfig.
// Section/label vocabulary matches PRESSURE_TEST_VERDICT_TEMPLATE in content seed.

type HeadingLookup = { kind: "heading"; level: number; heading: string };
type LabelLookup = { kind: "label"; label: string };
type SectionLookup = HeadingLookup | LabelLookup;

// `section` keys as they appear in validationConfig — some are actual
// Markdown headings, others (single_biggest_reason, evidence_note) are
// inline `**Label:**` markers within a heading's body. Rules don't
// distinguish between the two; this table does.
const SECTION_LOOKUPS: Record<string, SectionLookup> = {
  confirmed_qa: { kind: "heading", level: 2, heading: "Confirmed Q&A" },
  four_part_verdict: {
    kind: "heading",
    level: 2,
    heading: "Four-Part Verdict",
  },
  founders_decision: {
    kind: "heading",
    level: 2,
    heading: "Founder's Decision",
  },
  failure_reasons: {
    kind: "heading",
    level: 3,
    heading: "1. Five reasons this business may fail",
  },
  competitors_alternatives: {
    kind: "heading",
    level: 3,
    heading: "2. Existing competitors and alternatives",
  },
  success_conditions: {
    kind: "heading",
    level: 3,
    heading: "3. Conditions required for success",
  },
  strongest_counter_case: {
    kind: "heading",
    level: 3,
    heading: "Strongest counter-case",
  },
  single_biggest_reason: { kind: "label", label: "Single biggest reason" },
  evidence_note: { kind: "label", label: "Evidence note" },
};

// `enum` rules identify their target by rule `key`, not a `section`
// field (module-1.ts's `investor_decision` rule has no `section` at
// all) — this is the equivalent lookup table for those.
const ENUM_RULE_LABELS: Record<string, string> = {
  investor_decision: "Decision",
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

// Runtime-validated shape of one entry in validationConfig.draftRules —
// content is data, not code, so its shape is checked here rather than
// trusted at the type level.
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

// `response_count` counts every currently-answered Response, not just a
// hardcoded list of "the 6 core question keys" — validationConfig itself
// carries no such list. Interpreted as "at least `expected`" (not
// "exactly"): a Founder who has already started on the Founder's
// Decision questions by the time they run a draft check must not fail
// this rule just for being further along than the minimum.
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

// Exact count (not minimum): the template pre-seeds exactly `expected`
// numbered placeholder lines, so the natural complete state is exactly
// that many non-empty items.
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
  const passed = allowed.includes(normalized);
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

// Each submissionRule is individually coded (dispatched by `key`, not a
// generic `type`) — there are only 4, each with its own bespoke
// data source (a Response vs. an AI-generated Artifact section), so a
// generic dispatcher would add a layer of indirection with no reuse to
// show for it.
function runSubmissionRule(rule: RawRule, ctx: ValidationContext): RuleCheck {
  switch (rule.key) {
    case "initial_decision_present": {
      const passed = isAnswered(getResponse(ctx, "initial_decision"));
      return {
        key: rule.key,
        passed,
        message: passed ? undefined : "initial_decision has not been answered.",
      };
    }
    case "final_decision_present": {
      const passed = isAnswered(getResponse(ctx, "final_decision"));
      return {
        key: rule.key,
        passed,
        message: passed ? undefined : "final_decision has not been answered.",
      };
    }
    case "strongest_counter_case_present": {
      const passed = sectionIsNonEmpty(ctx.content, "strongest_counter_case");
      return {
        key: rule.key,
        passed,
        message: passed
          ? undefined
          : `Section "strongest_counter_case" is missing or empty.`,
      };
    }
    case "pivot_detail_when_pivot": {
      const finalDecision = getResponse(ctx, "final_decision");
      if ((finalDecision?.answerText ?? "").trim().toLowerCase() !== "pivot") {
        return { key: rule.key, passed: true };
      }
      const passed = isAnswered(getResponse(ctx, "pivot_detail"));
      return {
        key: rule.key,
        passed,
        message: passed
          ? undefined
          : "final_decision is pivot, but pivot_detail has not been answered.",
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

// Official validation re-runs every draftRule (a Founder must not be
// able to reach official validation with a draft-incomplete Artifact
// just because draft_check itself has no gating power) plus the 4
// submissionRules that only make sense once the Founder's Decision
// section is meant to be final.
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

export const pressureTestVerdictV1: Validator = {
  validatorKey: "pressure_test_verdict_v1",
  validatorVersion: "1.0.0",
  runDraftCheck,
  runOfficialCheck,
};
