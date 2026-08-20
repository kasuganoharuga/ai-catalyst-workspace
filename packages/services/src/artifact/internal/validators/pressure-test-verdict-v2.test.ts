import { describe, expect, it } from "vitest";

import { MODULE_1_CONTENT } from "@ai-catalyst/services/content-seed/content/module-1";

import { pressureTestVerdictV2 } from "./pressure-test-verdict-v2.js";
import type { ValidationContext, ValidationContextResponse } from "./types.js";

const VALIDATION_CONFIG = MODULE_1_CONTENT.artifacts[0].validationConfig;

const VALID_CONTENT = `# Pressure-Test Verdict

## Venture
- Venture name: Fixture Co

## Confirmed Q&A

### 1. Idea in one sentence

A marketplace for freelance welders.

### 2. Target customer

Small fabrication shops.

### 3. Customer problem

Finding qualified welders on short notice.

### 4. Business model

Take rate on completed jobs.

### 5. Current stage

idea_only

### 6. Competitors, alternatives, and doing nothing

Generic job boards, word of mouth, doing nothing.

## AI Recommendation

**Recommendation:** Pivot

**Reason:** Positioning is clearer than the current go-to-market proof.

## Five Failure Reasons

1. No repeat demand
2. Hard to verify quality
3. Thin margins
4. Regulatory risk
5. Slow sales cycle

## Competitors / Alternatives

1. Generic job boards
2. Word of mouth referrals
3. Doing nothing

**Evidence note:** Based on 5 customer interviews conducted in the last two weeks.

## Success Conditions

Ten repeat customers within the first quarter.

## Investor Decision

**Decision:** No

**Single biggest reason:** No evidence of paid demand yet.

## Recommended Next Step

Interview ten fabrication shop owners about hiring urgency this month.

## Working Notes / Unresolved Assumptions

- None
`;

function buildResponse(
  questionKey: string,
  answerText: string | null,
  responseStatus: ValidationContextResponse["responseStatus"] = "answered",
): ValidationContextResponse {
  return { questionKey, responseStatus, answerText, answerData: null };
}

const VALID_RESPONSES: ValidationContextResponse[] = [
  buildResponse("idea_one_sentence", "A marketplace for freelance welders."),
  buildResponse("target_customer", "Small fabrication shops."),
  buildResponse(
    "customer_problem",
    "Finding qualified welders on short notice.",
  ),
  buildResponse("business_model", "Take rate on completed jobs."),
  buildResponse("current_stage", "idea_only"),
  buildResponse(
    "competitors_alternatives",
    "Generic job boards, word of mouth.",
  ),
];

function buildContext(
  overrides: Partial<ValidationContext> = {},
): ValidationContext {
  return {
    content: VALID_CONTENT,
    responses: VALID_RESPONSES,
    validationConfig: VALIDATION_CONFIG,
    ...overrides,
  };
}

function findCheck(
  result: { checks: Array<{ key: string; passed: boolean; message?: string }> },
  key: string,
) {
  const check = result.checks.find((entry) => entry.key === key);
  if (!check) {
    throw new Error(`No check found for key "${key}".`);
  }
  return check;
}

describe("pressure_test_verdict_v2", () => {
  it("passes official check against fully-completed locked-schema content", () => {
    const result = pressureTestVerdictV2.runOfficialCheck(buildContext());
    expect(result.passed).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.checks.every((check) => check.passed)).toBe(true);
  });

  it("passes ai_recommendation with a Pivot recommendation", () => {
    expect(VALID_CONTENT).toContain("**Recommendation:** Pivot");
    const result = pressureTestVerdictV2.runOfficialCheck(buildContext());
    expect(findCheck(result, "ai_recommendation").passed).toBe(true);
  });

  it("fails required_markdown_sections when AI Recommendation heading is missing", () => {
    const content = VALID_CONTENT.replace(
      "## AI Recommendation",
      "## Something Else",
    );
    const result = pressureTestVerdictV2.runDraftCheck(
      buildContext({ content }),
    );
    const check = findCheck(result, "required_markdown_sections");
    expect(check.passed).toBe(false);
    expect(check.message).toContain("ai_recommendation");
  });
});
