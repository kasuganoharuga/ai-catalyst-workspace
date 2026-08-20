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

| Experiment | Claim tested | Pass condition | Fail condition | Time | Cost | Expected evidence signal | 30-day window |
|---|---|---|---|---|---|---|---|
| Concierge pilot | Leads will hand over a real run sheet for manual reconciliation | 3 of 8 leads send a run sheet within 48 hours | Fewer than 2 of 8 respond within a week | 4 hours/week | $0 | Behavioural | Week 1 |
| Paid waitlist | Leads will pay a deposit to reserve a pilot slot | 2 of 8 leads pay a $50 deposit | Zero leads pay within 2 weeks | 2 hours/week | $50 | Binding | Week 2–3 |

### Expected evidence signal

- **Informational** — produces only general information or weak indirect evidence
- **Clarifying** — clarifies an assumption but cannot establish customer behaviour
- **Primary** — can produce direct primary evidence from matching customers
- **Behavioural** — can produce an observable behavioural or commercial demand signal, including founder-prompted outreach (a CTA click after the Founder sends a page is Behavioural, not Evidence Maturity Level 4)
- **Binding** — can produce deposit paid, paid pilot signed, contract / PO, or actual payment (a verbal firm start date alone is not Binding)

## Start Here

**What to do:** Send the concierge pilot offer to all 8 warm introductions this week.

**Who to contact, and how:** The 8 Melbourne depot contacts, by direct message.

**What counts as a pass:** 3 of 8 leads send a run sheet within 48 hours

**What counts as a fail:** Fewer than 2 of 8 respond within a week

## 30-Day Decision

**Proceed when:** Repeated pain confirmed, observable demand, and at least one deposit or paid pilot.

**Refine when:** Problem confirmed but demand or segment signals are mixed.

**Stop or re-scope when:** Narrow segment mostly reports manageable pain or no willingness to act.

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

  it("parses signal strength as a word label", () => {
    expect(model.experiments[0].signalStrength).toBe("Behavioural");
    expect(model.experiments[1].signalStrength).toBe("Binding");
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

  it("extracts 30-Day Decision", () => {
    expect(model.day30Decision.proceedWhen).toContain("deposit or paid pilot");
    expect(model.day30Decision.refineWhen).toContain("mixed");
    expect(model.day30Decision.stopOrRescopeWhen).toContain("manageable pain");
  });

  it("extracts How to Record Results", () => {
    expect(model.howToRecordResults).toContain("Keep the results with you");
  });
});

describe("parseValidationRoadmap — negative cases (each must throw WORKBOOK_RENDER_FAILED)", () => {
  it("throws with only 1 experiment", () => {
    const bad = fixture().replace(
      "| Paid waitlist | Leads will pay a deposit to reserve a pilot slot | 2 of 8 leads pay a $50 deposit | Zero leads pay within 2 weeks | 2 hours/week | $50 | Binding | Week 2–3 |\n",
      "",
    );
    expect(() => parseValidationRoadmap(bad)).toThrow(
      /WORKBOOK_RENDER_FAILED.*Experiments/,
    );
  });

  it("throws with 4 experiments", () => {
    const bad = fixture().replace(
      "| Paid waitlist | Leads will pay a deposit to reserve a pilot slot | 2 of 8 leads pay a $50 deposit | Zero leads pay within 2 weeks | 2 hours/week | $50 | Binding | Week 2–3 |",
      `| Paid waitlist | Leads will pay a deposit to reserve a pilot slot | 2 of 8 leads pay a $50 deposit | Zero leads pay within 2 weeks | 2 hours/week | $50 | Binding | Week 2–3 |
| Extra row | Claim | Pass | Fail | 1h | $0 | Primary | Week 4 |
| Extra row 2 | Claim | Pass | Fail | 1h | $0 | Primary | Week 4 |`,
    );
    expect(() => parseValidationRoadmap(bad)).toThrow(
      /WORKBOOK_RENDER_FAILED.*Experiments/,
    );
  });

  it("throws when Start Here pass disagrees with experiment 1", () => {
    const bad = fixture().replace(
      "**What counts as a pass:** 3 of 8 leads send a run sheet within 48 hours",
      "**What counts as a pass:** Something completely different",
    );
    expect(() => parseValidationRoadmap(bad)).toThrow(
      /WORKBOOK_RENDER_FAILED.*pass condition/,
    );
  });

  it("throws on an invalid signal label", () => {
    const bad = fixture().replace("| Behavioural | Week 1 |", "| 4 | Week 1 |");
    expect(() => parseValidationRoadmap(bad)).toThrow(
      /WORKBOOK_RENDER_FAILED.*signal strength/,
    );
  });

  it("throws when the Expected evidence signal column is missing", () => {
    const bad = fixture().replace(
      "| Experiment | Claim tested | Pass condition | Fail condition | Time | Cost | Expected evidence signal | 30-day window |",
      "| Experiment | Claim tested | Pass condition | Fail condition | Time | Cost | 30-day window |",
    );
    expect(() => parseValidationRoadmap(bad)).toThrow(
      /WORKBOOK_RENDER_FAILED.*Expected evidence signal/,
    );
  });

  it("throws when 30-Day Decision is missing", () => {
    const bad = fixture().replace(
      /## 30-Day Decision[\s\S]*?## How to Record Results/,
      "## How to Record Results",
    );
    expect(() => parseValidationRoadmap(bad)).toThrow(
      /WORKBOOK_RENDER_FAILED.*30-Day Decision/,
    );
  });
});
