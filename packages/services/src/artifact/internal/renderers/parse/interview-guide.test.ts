import { describe, expect, it } from "vitest";

import { parseInterviewGuide } from "./interview-guide.js";

// Mirrors the real structure from
// content-seed/content/module-3.ts's PROBLEM_INTERVIEW_GUIDE_TEMPLATE,
// filled in as a Founder's confirmed submission would be. Negative tests
// call `.replace()` directly on this fixture's output to break one thing
// at a time.
function fixture(): string {
  return `# Problem Interview Guide

## Venture
- Venture name: Kerbside

## Interview Target

Operations leads at 50–200 person waste-collection contractors in metro Australia.

## What This Interview Tests

Whether route supervisors actually lose recoverable hours to manual run-sheet reconciliation.

## Five Interview Questions

1. Tell me about the last time a run sheet did not match what the trucks actually did.
2. How often does that happen in a typical month?
3. What have you already tried or bought to stop it happening?
4. Walk me through what you did the last time it happened.
5. Where does this sit against everything else on your plate this quarter?

## Mom Test Rules

- Ask about what actually happened, never about what they would do.
- Do not describe the product until the conversation is over.
- Treat compliments as noise and steer back to a past occurrence.
- Ask for numbers they already know, never numbers they would estimate.

## Pass Bar

**For this five-interview validation round, the problem meets the pass bar when at least 3 of 5
interviews satisfy the conditions below:**

- Described a specific reconciliation failure from the last 60 days.
- Named a cost in hours or dollars for that occurrence.
- Has already spent money, staff time or tooling on the problem.

## Kill Criteria

**Three patterns that mean this problem is not worth building for and the scope has to change:**

1. The supervisor treats the work as normal and shows no interest in removing it.
2. The cost per occurrence is under one hour of a supervisor's time.
3. An existing tool would solve it if configured.

## After Each Call

- Write the verbatim notes within 30 minutes.
- Record the customer's own words rather than a summary.
- Record anything that contradicted the problem statement.

## Where Results Go

Interview results are not recorded in this guide. Run the five conversations and bring the notes
into the next module.
`;
}

describe("parseInterviewGuide — happy path", () => {
  const model = parseInterviewGuide(fixture());

  it("extracts the venture name", () => {
    expect(model.ventureName).toBe("Kerbside");
  });

  it("extracts exactly 5 questions, in order", () => {
    expect(model.questions).toHaveLength(5);
    expect(model.questions[0]).toContain("Tell me about the last time");
    expect(model.questions[4]).toContain("everything else on your plate");
  });

  it("extracts Mom Test rules", () => {
    expect(model.momTestRules).toHaveLength(4);
  });

  it("extracts the Pass Bar preamble and conditions separately", () => {
    expect(model.passBar.preamble).toContain("at least 3 of 5");
    expect(model.passBar.preamble).not.toContain("**"); // emphasis stripped
    expect(model.passBar.conditions).toHaveLength(3);
    expect(model.passBar.conditions[0]).toContain(
      "specific reconciliation failure",
    );
  });

  it("extracts exactly 3 kill criteria", () => {
    expect(model.killCriteria).toHaveLength(3);
  });

  it("strips markdown emphasis from extracted text", () => {
    for (const condition of model.passBar.conditions) {
      expect(condition).not.toMatch(/\*\*/);
    }
  });

  it("extracts After Each Call and Where Results Go", () => {
    expect(model.afterEachCall.length).toBeGreaterThan(0);
    expect(model.whereResultsGo).toContain("Run the five conversations");
  });
});

describe("parseInterviewGuide — negative cases (each must throw WORKBOOK_RENDER_FAILED)", () => {
  it("throws when there are only 4 questions", () => {
    const bad = fixture().replace(
      "5. Where does this sit against everything else on your plate this quarter?\n",
      "",
    );
    expect(() => parseInterviewGuide(bad)).toThrow(
      /WORKBOOK_RENDER_FAILED.*Five Interview Questions/,
    );
  });

  it("throws when there are 6 questions", () => {
    const bad = fixture().replace(
      "## Mom Test Rules",
      "6. One extra question that should not be here.\n\n## Mom Test Rules",
    );
    expect(() => parseInterviewGuide(bad)).toThrow(
      /WORKBOOK_RENDER_FAILED.*Five Interview Questions/,
    );
  });

  it("throws when Kill Criteria has only 2 patterns", () => {
    const bad = fixture().replace(
      "3. An existing tool would solve it if configured.\n",
      "",
    );
    expect(() => parseInterviewGuide(bad)).toThrow(
      /WORKBOOK_RENDER_FAILED.*Kill Criteria/,
    );
  });

  it("throws when Kill Criteria has 4 patterns", () => {
    const bad = fixture().replace(
      "## After Each Call",
      "4. A fourth kill pattern that should not exist.\n\n## After Each Call",
    );
    expect(() => parseInterviewGuide(bad)).toThrow(
      /WORKBOOK_RENDER_FAILED.*Kill Criteria/,
    );
  });

  it("throws when After Each Call is missing entirely", () => {
    const bad = fixture().replace(
      /## After Each Call\n\n- Write the verbatim notes within 30 minutes\.\n- Record the customer's own words rather than a summary\.\n- Record anything that contradicted the problem statement\.\n\n/,
      "",
    );
    expect(() => parseInterviewGuide(bad)).toThrow(
      /WORKBOOK_RENDER_FAILED.*After Each Call/,
    );
  });

  it("throws when Venture name is blank", () => {
    const bad = fixture().replace(
      "- Venture name: Kerbside",
      "- Venture name:",
    );
    expect(() => parseInterviewGuide(bad)).toThrow(
      /WORKBOOK_RENDER_FAILED.*Venture name/,
    );
  });

  it("throws when Pass Bar has only 2 conditions", () => {
    const bad = fixture().replace(
      "- Has already spent money, staff time or tooling on the problem.\n",
      "",
    );
    expect(() => parseInterviewGuide(bad)).toThrow(
      /WORKBOOK_RENDER_FAILED.*Pass Bar/,
    );
  });

  it("throws when Interview Target is empty", () => {
    const bad = fixture().replace(
      "Operations leads at 50–200 person waste-collection contractors in metro Australia.",
      "",
    );
    expect(() => parseInterviewGuide(bad)).toThrow(
      /WORKBOOK_RENDER_FAILED.*Interview Target/,
    );
  });
});
