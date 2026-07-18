import { describe, expect, it } from "vitest";

import { MODULE_1_CONTENT } from "@ai-catalyst/services/content-seed/content/module-1";

import { pressureTestVerdictV1 } from "./pressure-test-verdict-v1.js";
import type { ValidationContext, ValidationContextResponse } from "./types.js";

// Pulls the real seeded validationConfig (1.4's module-1.ts) rather than
// a hand-rolled copy — this test is the thing that proves the Validator
// actually implements the rules content declares, so it must run against
// the same object content-seed writes to artifact_definitions.validation_config,
// not a fixture that could silently drift from it.
const VALIDATION_CONFIG = MODULE_1_CONTENT.artifacts[0].validationConfig;

const VALID_CONTENT = `# Pressure-Test Verdict

## Venture
- Venture name: Fixture Co

## Confirmed Q&A

### 1. Idea in one sentence

A marketplace for freelance welders.

### 2. Target customer

Small fabrication shops.

## Four-Part Verdict

### 1. Five reasons this business may fail

1. No repeat demand
2. Hard to verify quality
3. Thin margins
4. Regulatory risk
5. Slow sales cycle

### 2. Existing competitors and alternatives

1. Generic job boards
2. Word of mouth referrals
3. Doing nothing

**Evidence note:** Based on 5 customer interviews conducted in the last two weeks.

### 3. Conditions required for success

Ten repeat customers within the first quarter.

### 4. Would an investor invest today?

**Decision:** Yes

**Single biggest reason:** Strong early demand signal from interviews.

## Founder's Decision

### Initial decision

Proceed

### Strongest counter-case

A well-funded incumbent could copy the matching flow within a quarter.

### Final confirmed decision

Proceed

### Pivot detail, if applicable

N/A

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
  buildResponse("customer_problem", "Finding qualified welders on short notice."),
  buildResponse("business_model", "Take rate on completed jobs."),
  buildResponse("current_stage", "idea_only"),
  buildResponse("competitors_alternatives", "Generic job boards, word of mouth."),
  buildResponse("initial_decision", "proceed"),
  buildResponse("final_decision", "proceed"),
  buildResponse("pivot_detail", null, "not_applicable"),
];

function buildContext(overrides: Partial<ValidationContext> = {}): ValidationContext {
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

describe("pressure_test_verdict_v1", () => {
  describe("runDraftCheck", () => {
    it("passes every draft rule against fully-completed content and responses", () => {
      const result = pressureTestVerdictV1.runDraftCheck(buildContext());

      expect(result.passed).toBe(true);
      expect(result.issues).toEqual([]);
      expect(result.checks).toHaveLength(8);
      expect(result.checks.every((check) => check.passed)).toBe(true);
      expect(result.score).toBe(100);
    });

    it("fails six_confirmed_responses when fewer than 6 Responses are answered", () => {
      const result = pressureTestVerdictV1.runDraftCheck(
        buildContext({ responses: VALID_RESPONSES.slice(0, 3) }),
      );
      expect(findCheck(result, "six_confirmed_responses").passed).toBe(false);
      expect(result.passed).toBe(false);
    });

    it("fails five_failure_reasons when the list has only 4 items", () => {
      const content = VALID_CONTENT.replace("5. Slow sales cycle\n", "");
      const result = pressureTestVerdictV1.runDraftCheck(buildContext({ content }));
      expect(findCheck(result, "five_failure_reasons").passed).toBe(false);
    });

    it("fails three_named_alternatives when only 2 items are named", () => {
      const content = VALID_CONTENT.replace("3. Doing nothing\n", "");
      const result = pressureTestVerdictV1.runDraftCheck(buildContext({ content }));
      expect(findCheck(result, "three_named_alternatives").passed).toBe(false);
    });

    it("fails success_conditions_actionable when the section is empty", () => {
      const content = VALID_CONTENT.replace(
        "Ten repeat customers within the first quarter.\n",
        "",
      );
      const result = pressureTestVerdictV1.runDraftCheck(buildContext({ content }));
      expect(findCheck(result, "success_conditions_actionable").passed).toBe(false);
    });

    it("fails investor_decision when the Decision marker is missing", () => {
      const content = VALID_CONTENT.replace("**Decision:** Yes\n", "");
      const result = pressureTestVerdictV1.runDraftCheck(buildContext({ content }));
      expect(findCheck(result, "investor_decision").passed).toBe(false);
    });

    it("fails investor_decision when the value is not yes/no", () => {
      const content = VALID_CONTENT.replace("**Decision:** Yes", "**Decision:** Maybe");
      const result = pressureTestVerdictV1.runDraftCheck(buildContext({ content }));
      expect(findCheck(result, "investor_decision").passed).toBe(false);
    });

    it("passes investor_decision case-insensitively", () => {
      const content = VALID_CONTENT.replace("**Decision:** Yes", "**Decision:** NO");
      const result = pressureTestVerdictV1.runDraftCheck(buildContext({ content }));
      expect(findCheck(result, "investor_decision").passed).toBe(true);
    });

    it("fails single_strongest_reason when the label has no value", () => {
      const content = VALID_CONTENT.replace(
        "**Single biggest reason:** Strong early demand signal from interviews.\n",
        "**Single biggest reason:**\n",
      );
      const result = pressureTestVerdictV1.runDraftCheck(buildContext({ content }));
      expect(findCheck(result, "single_strongest_reason").passed).toBe(false);
    });

    it("fails unsupported_evidence_labelled when the evidence note is missing", () => {
      const content = VALID_CONTENT.replace(
        "**Evidence note:** Based on 5 customer interviews conducted in the last two weeks.\n",
        "",
      );
      const result = pressureTestVerdictV1.runDraftCheck(buildContext({ content }));
      expect(findCheck(result, "unsupported_evidence_labelled").passed).toBe(false);
    });

    it("fails required_markdown_sections when a top-level section heading is missing", () => {
      const content = VALID_CONTENT.replace("## Confirmed Q&A", "## Something Else");
      const result = pressureTestVerdictV1.runDraftCheck(buildContext({ content }));
      const check = findCheck(result, "required_markdown_sections");
      expect(check.passed).toBe(false);
      expect(check.message).toContain("confirmed_qa");
    });
  });

  describe("runOfficialCheck", () => {
    it("passes every draft + submission rule against fully-completed content and responses", () => {
      const result = pressureTestVerdictV1.runOfficialCheck(buildContext());

      expect(result.passed).toBe(true);
      expect(result.checks).toHaveLength(12);
      expect(result.checks.every((check) => check.passed)).toBe(true);
    });

    it("fails initial_decision_present when initial_decision has not been answered", () => {
      const responses = VALID_RESPONSES.filter(
        (response) => response.questionKey !== "initial_decision",
      );
      const result = pressureTestVerdictV1.runOfficialCheck(buildContext({ responses }));
      expect(findCheck(result, "initial_decision_present").passed).toBe(false);
    });

    it("fails final_decision_present when final_decision has not been answered", () => {
      const responses = VALID_RESPONSES.filter(
        (response) => response.questionKey !== "final_decision",
      );
      const result = pressureTestVerdictV1.runOfficialCheck(buildContext({ responses }));
      expect(findCheck(result, "final_decision_present").passed).toBe(false);
    });

    it("fails strongest_counter_case_present when that section is empty", () => {
      const content = VALID_CONTENT.replace(
        "A well-funded incumbent could copy the matching flow within a quarter.\n",
        "",
      );
      const result = pressureTestVerdictV1.runOfficialCheck(buildContext({ content }));
      expect(findCheck(result, "strongest_counter_case_present").passed).toBe(false);
    });

    it("passes pivot_detail_when_pivot when final_decision is not pivot, regardless of pivot_detail", () => {
      const result = pressureTestVerdictV1.runOfficialCheck(buildContext());
      expect(findCheck(result, "pivot_detail_when_pivot").passed).toBe(true);
    });

    it("fails pivot_detail_when_pivot when final_decision is pivot but pivot_detail is unanswered", () => {
      const responses = VALID_RESPONSES.map((response) =>
        response.questionKey === "final_decision" ? buildResponse("final_decision", "pivot") : response,
      );
      const result = pressureTestVerdictV1.runOfficialCheck(buildContext({ responses }));
      expect(findCheck(result, "pivot_detail_when_pivot").passed).toBe(false);
    });

    it("passes pivot_detail_when_pivot when final_decision is pivot and pivot_detail is answered", () => {
      const responses = VALID_RESPONSES.map((response) => {
        if (response.questionKey === "final_decision") {
          return buildResponse("final_decision", "pivot");
        }
        if (response.questionKey === "pivot_detail") {
          return buildResponse("pivot_detail", "Switch to a subscription model.");
        }
        return response;
      });
      const result = pressureTestVerdictV1.runOfficialCheck(buildContext({ responses }));
      expect(findCheck(result, "pivot_detail_when_pivot").passed).toBe(true);
    });

    it("still enforces draft rules during an official check", () => {
      const content = VALID_CONTENT.replace("5. Slow sales cycle\n", "");
      const result = pressureTestVerdictV1.runOfficialCheck(buildContext({ content }));
      expect(findCheck(result, "five_failure_reasons").passed).toBe(false);
      expect(result.passed).toBe(false);
    });
  });
});
