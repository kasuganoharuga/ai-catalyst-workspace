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

## Opening Script

Thanks for the time. I'm researching how operations leads at contractors like yours actually run
run-sheet reconciliation today — I'm not selling anything, and there's no pitch coming. I'd like to
record this so I can focus on the conversation rather than note-taking — is that okay?

## Five Interview Questions

1. Tell me about the last time a run sheet did not match what the trucks actually did.
2. How often does that happen in a typical month?
3. What have you already tried or bought to stop it happening?
4. Walk me through what you did the last time it happened.
5. Where does this sit against everything else on your plate this quarter?

## Question Guidance

### Q1

**Listen for:**

- A specific, dated occurrence rather than a general description.
- A named system or paper process involved in the mismatch.
- An admission that the mismatch was only caught by chance.

**Suggestion:**

If they describe the mismatch in the abstract, ask them to walk through the exact moment they
noticed it — what they were looking at, and what tipped them off.

### Q2

**Listen for:**

- A frequency stated in occurrences per week or month, not "sometimes."
- Escalating language such as "more than it used to."

**Suggestion:**

Push for a number even if they resist — "roughly how many times last month?" — and note whether they
have to guess or already know it cold.

### Q3

**Listen for:**

- A named tool or spend, not just "we manage."
- An abandoned attempt, not only current tools.

**Suggestion:**

Ask explicitly what they tried and stopped using — abandoned spend is stronger signal than current
spend.

### Q4

**Listen for:**

- Who personally absorbed the extra work.
- Whether the fix was a one-off patch or a process change.

**Suggestion:**

If they describe only the fix, ask what happened to the underlying process afterwards — did anything
change, or did it just get patched again.

### Q5

**Listen for:**

- A named competing priority they chose instead.
- A budget or time-allocation decision that reveals real ranking.

**Suggestion:**

If they say "it's important," ask what they fixed instead this quarter — the answer reveals the real
ranking better than a stated one.

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

**Two patterns. True kills mean the problem is not worth pursuing and scope must change:**

1. The supervisor treats the work as normal and shows no interest in removing it.
2. The cost per occurrence is under one hour of a supervisor's time.

## Assumptions Being Validated

| # | Assumption | Validated if… | Invalidated if… |
|---|---|---|---|
| A1 | Supervisors lose 2+ hours per week reconciling run sheets by hand. | Interviewee names a specific weekly time cost of 2+ hours. | Reconciliation is already automated or takes under 30 minutes. |
| A2 | The mismatch is discovered reactively, not flagged by existing tools. | Interviewee describes finding out by chance or complaint. | Existing tooling already flags mismatches proactively. |
| A3 | At least one paid or abandoned tool already exists for this problem. | Interviewee names a specific tool they paid for or tried. | No tool has ever been tried or purchased for this. |

## Closing Questions

Ask both at the end of every conversation, before any pitch:

- Is there anyone else you'd suggest I speak to who deals with this kind of thing?
- If we build something that solves this, would you be open to trying it first?

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

  it("extracts the Opening Script", () => {
    expect(model.openingScript).toContain("not selling anything");
  });

  it("extracts exactly 5 questions, in order", () => {
    expect(model.questions).toHaveLength(5);
    expect(model.questions[0]).toContain("Tell me about the last time");
    expect(model.questions[4]).toContain("everything else on your plate");
  });

  it("extracts Question Guidance for all 5 questions, in order", () => {
    expect(model.questionGuidance).toHaveLength(5);
    expect(model.questionGuidance[0].listenFor).toHaveLength(3);
    expect(model.questionGuidance[0].listenFor[0]).toContain(
      "specific, dated occurrence",
    );
    expect(model.questionGuidance[0].suggestion).toContain("exact moment they");
    expect(model.questionGuidance[4].listenFor).toHaveLength(2);
    expect(model.questionGuidance[4].suggestion).toContain(
      "fixed instead this quarter",
    );
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

  it("extracts exactly 2 kill criteria", () => {
    expect(model.killCriteria).toHaveLength(2);
  });

  it("strips markdown emphasis from extracted text", () => {
    for (const condition of model.passBar.conditions) {
      expect(condition).not.toMatch(/\*\*/);
    }
    for (const guidance of model.questionGuidance) {
      expect(guidance.suggestion).not.toMatch(/\*\*/);
    }
  });

  it("extracts the Assumptions Being Validated table", () => {
    expect(model.assumptions).toHaveLength(3);
    expect(model.assumptions[0].assumption).toContain("lose 2+ hours per week");
    expect(model.assumptions[0].validatedIf).toContain("2+ hours");
    expect(model.assumptions[0].invalidatedIf).toContain("already automated");
  });

  it("extracts exactly 2 Closing Questions", () => {
    expect(model.closingQuestions).toHaveLength(2);
    expect(model.closingQuestions[0]).toContain("anyone else");
    expect(model.closingQuestions[1]).toContain("open to trying it first");
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
      "## Question Guidance",
      "6. One extra question that should not be here.\n\n## Question Guidance",
    );
    expect(() => parseInterviewGuide(bad)).toThrow(
      /WORKBOOK_RENDER_FAILED.*Five Interview Questions/,
    );
  });

  it("throws when Q1 has no Listen for list", () => {
    const bad = fixture().replace(
      /\*\*Listen for:\*\*\n\n- A specific, dated occurrence rather than a general description\.\n- A named system or paper process involved in the mismatch\.\n- An admission that the mismatch was only caught by chance\.\n\n/,
      "",
    );
    expect(() => parseInterviewGuide(bad)).toThrow(
      /WORKBOOK_RENDER_FAILED.*Q1.*Listen for/,
    );
  });

  it("throws when Q1 has no Suggestion", () => {
    const bad = fixture().replace(
      /\*\*Suggestion:\*\*\n\nIf they describe the mismatch in the abstract, ask them to walk through the exact moment they\nnoticed it — what they were looking at, and what tipped them off\.\n\n/,
      "",
    );
    expect(() => parseInterviewGuide(bad)).toThrow(
      /WORKBOOK_RENDER_FAILED.*Q1.*Suggestion/,
    );
  });

  it("throws when the Assumptions table has only 2 rows", () => {
    const bad = fixture().replace(
      "| A3 | At least one paid or abandoned tool already exists for this problem. | Interviewee names a specific tool they paid for or tried. | No tool has ever been tried or purchased for this. |\n",
      "",
    );
    expect(() => parseInterviewGuide(bad)).toThrow(
      /WORKBOOK_RENDER_FAILED.*Assumptions Being Validated/,
    );
  });

  it("throws when there is only 1 Closing Question", () => {
    const bad = fixture().replace(
      "- If we build something that solves this, would you be open to trying it first?\n",
      "",
    );
    expect(() => parseInterviewGuide(bad)).toThrow(
      /WORKBOOK_RENDER_FAILED.*Closing Questions/,
    );
  });

  it("throws when Opening Script is missing", () => {
    const bad = fixture().replace(
      /## Opening Script\n\nThanks for the time\. I'm researching how operations leads at contractors like yours actually run\nrun-sheet reconciliation today — I'm not selling anything, and there's no pitch coming\. I'd like to\nrecord this so I can focus on the conversation rather than note-taking — is that okay\?\n\n/,
      "",
    );
    expect(() => parseInterviewGuide(bad)).toThrow(
      /WORKBOOK_RENDER_FAILED.*Opening Script/,
    );
  });

  it("throws when Kill Criteria has only 1 pattern", () => {
    const bad = fixture().replace(
      "2. The cost per occurrence is under one hour of a supervisor's time.\n",
      "",
    );
    expect(() => parseInterviewGuide(bad)).toThrow(
      /WORKBOOK_RENDER_FAILED.*Kill Criteria/,
    );
  });

  it("throws when Kill Criteria has 4 patterns", () => {
    const bad = fixture().replace(
      "## Assumptions Being Validated",
      "4. A fourth kill pattern that should not exist.\n\n## Assumptions Being Validated",
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
