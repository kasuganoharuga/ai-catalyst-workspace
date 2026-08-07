import { describe, expect, it } from "vitest";

import { parseValidationRoadmap } from "./validation-roadmap.js";

// Mirrors content-seed/content/module-4.ts's VALIDATION_ROADMAP_TEMPLATE,
// filled in as a Founder's confirmed submission would be — two experiments.
function fixture(): string {
  return `# 30-Day Validation Roadmap

## Venture
- Venture name: Kerbside

## Constraints

**Time available:** 6 hours a week

**Budget:** $500

**Customer access:** 12 warm introductions from the Melbourne depot network

## What These Experiments Test

Whether operations leads will take a concrete step toward solving reconciliation, not just talk about it.

## Experiments

| Experiment | Claim tested | Pass condition | Fail condition | Time | Cost | Expected evidence signal strength (1–5) | 30-day window |
|---|---|---|---|---|---|---|---|
| Concierge pilot | Leads will hand over a real run sheet for manual reconciliation | 3 of 8 leads send a run sheet within 48 hours | Fewer than 2 of 8 respond within a week | 4 hours/week | $0 | 4 | Week 1 |
| Paid waitlist | Leads will pay a deposit to reserve a pilot slot | 2 of 8 leads pay a $50 deposit | Zero leads pay within 2 weeks | 2 hours/week | $50 | 5 | Week 2–3 |

### Expected evidence signal strength

- **1** — produces only general information or weak indirect evidence
- **2** — clarifies an assumption but cannot establish customer behaviour
- **3** — can produce direct primary evidence from matching customers
- **4** — can produce an observable behavioural or commercial demand signal
- **5** — can produce a binding commercial commitment or payment

## Start Here

**What to do:** Send the concierge pilot offer to all 8 warm introductions this week.

**Who to contact, and how:** The 8 Melbourne depot contacts, by direct message.

**What counts as a pass:** 3 of 8 leads send a run sheet within 48 hours

**What counts as a fail:** Fewer than 2 of 8 respond within a week

## How to Record Results

Results are not recorded in this roadmap. Keep the results with you and bring them into the review
that follows.
`;
}

describe("parseValidationRoadmap — happy path", () => {
  const model = parseValidationRoadmap(fixture());

  it("extracts the venture name and constraints", () => {
    expect(model.ventureName).toBe("Kerbside");
    expect(model.constraints.timeAvailable).toBe("6 hours a week");
    expect(model.constraints.budget).toBe("$500");
    expect(model.constraints.customerAccess).toContain("12 warm introductions");
  });

  it("extracts exactly 2 experiments in order", () => {
    expect(model.experiments).toHaveLength(2);
    expect(model.experiments[0].name).toBe("Concierge pilot");
    expect(model.experiments[1].name).toBe("Paid waitlist");
  });

  it("parses signal strength as an integer", () => {
    expect(model.experiments[0].signalStrength).toBe(4);
    expect(model.experiments[1].signalStrength).toBe(5);
  });

  it("extracts every required cell per experiment", () => {
    const first = model.experiments[0];
    expect(first.claimTested).toContain("hand over a real run sheet");
    expect(first.passCondition).toContain("3 of 8 leads");
    expect(first.failCondition).toContain("Fewer than 2 of 8");
    expect(first.time).toBe("4 hours/week");
    expect(first.cost).toBe("$0");
    expect(first.window).toBe("Week 1");
  });

  it("extracts exactly 5 signal strength anchors", () => {
    expect(model.signalStrengthAnchors).toHaveLength(5);
    expect(model.signalStrengthAnchors[0]).not.toMatch(/\*\*/); // emphasis stripped
  });

  it("extracts Start Here", () => {
    expect(model.startHere.whatToDo).toContain("concierge pilot offer");
    expect(model.startHere.whoToContact).toContain("Melbourne depot");
  });

  it("Start Here's pass/fail agree with experiment 1's, after normalisation", () => {
    expect(model.startHere.pass).toContain("3 of 8 leads");
    expect(model.startHere.fail).toContain("Fewer than 2 of 8");
  });

  it("extracts How to Record Results", () => {
    expect(model.howToRecordResults).toContain("Keep the results with you");
  });
});

describe("parseValidationRoadmap — negative cases (each must throw WORKBOOK_RENDER_FAILED)", () => {
  it("throws with only 1 experiment", () => {
    const bad = fixture().replace(
      "| Paid waitlist | Leads will pay a deposit to reserve a pilot slot | 2 of 8 leads pay a $50 deposit | Zero leads pay within 2 weeks | 2 hours/week | $50 | 5 | Week 2–3 |\n",
      "",
    );
    expect(() => parseValidationRoadmap(bad)).toThrow(
      /WORKBOOK_RENDER_FAILED.*Experiments/,
    );
  });

  it("throws with 4 experiments", () => {
    const bad = fixture().replace(
      "### Expected evidence signal strength",
      "| Third experiment | Claim | Pass | Fail | 1 hour | $0 | 2 | Week 4 |\n" +
        "| Fourth experiment | Claim | Pass | Fail | 1 hour | $0 | 2 | Week 4 |\n\n" +
        "### Expected evidence signal strength",
    );
    expect(() => parseValidationRoadmap(bad)).toThrow(
      /WORKBOOK_RENDER_FAILED.*Experiments/,
    );
  });

  it("throws when signal strength is out of range", () => {
    const bad = fixture().replace("| 4 | Week 1 |", "| 9 | Week 1 |");
    expect(() => parseValidationRoadmap(bad)).toThrow(
      /WORKBOOK_RENDER_FAILED.*signal strength/,
    );
  });

  it("throws when signal strength is not a number", () => {
    const bad = fixture().replace("| 4 | Week 1 |", "| high | Week 1 |");
    expect(() => parseValidationRoadmap(bad)).toThrow(
      /WORKBOOK_RENDER_FAILED.*signal strength/,
    );
  });

  it("throws when there are only 4 signal strength anchors", () => {
    const bad = fixture().replace(
      "- **5** — can produce a binding commercial commitment or payment\n",
      "",
    );
    expect(() => parseValidationRoadmap(bad)).toThrow(
      /WORKBOOK_RENDER_FAILED.*[Ss]ignal strength/,
    );
  });

  it("throws when Start Here's pass condition does not match experiment 1's", () => {
    const bad = fixture().replace(
      "**What counts as a pass:** 3 of 8 leads send a run sheet within 48 hours",
      "**What counts as a pass:** literally any response at all",
    );
    expect(() => parseValidationRoadmap(bad)).toThrow(
      /WORKBOOK_RENDER_FAILED.*pass condition/,
    );
  });

  it("throws when Start Here's fail condition does not match experiment 1's", () => {
    const bad = fixture().replace(
      "**What counts as a fail:** Fewer than 2 of 8 respond within a week",
      "**What counts as a fail:** nobody ever responds, ever",
    );
    expect(() => parseValidationRoadmap(bad)).toThrow(
      /WORKBOOK_RENDER_FAILED.*fail condition/,
    );
  });

  it("throws when a required table column is missing", () => {
    const bad = fixture().replace(
      "| Experiment | Claim tested | Pass condition | Fail condition | Time | Cost | Expected evidence signal strength (1–5) | 30-day window |",
      "| Experiment | Claim tested | Pass condition | Fail condition | Time | Cost | 30-day window |",
    );
    expect(() => parseValidationRoadmap(bad)).toThrow(/WORKBOOK_RENDER_FAILED/);
  });

  it("throws when Venture name is blank", () => {
    const bad = fixture().replace(
      "- Venture name: Kerbside",
      "- Venture name:",
    );
    expect(() => parseValidationRoadmap(bad)).toThrow(
      /WORKBOOK_RENDER_FAILED.*Venture name/,
    );
  });

  it("throws when Budget is missing", () => {
    const bad = fixture().replace("**Budget:** $500\n\n", "");
    expect(() => parseValidationRoadmap(bad)).toThrow(
      /WORKBOOK_RENDER_FAILED.*Budget/,
    );
  });
});
