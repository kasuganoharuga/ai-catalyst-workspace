import { describe, expect, it } from "vitest";

import { structuredMarkdownV1 } from "./structured-markdown-v1.js";
import type { ValidationContext, ValidationContextResponse } from "./types.js";

function makeContext(
  content: string,
  draftRules: unknown[],
  submissionRules: unknown[] = [],
  responses: ValidationContextResponse[] = [],
): ValidationContext {
  return {
    content,
    responses,
    validationConfig: { schemaVersion: 1, draftRules, submissionRules },
  };
}

function response(questionKey: string, answerText: string): ValidationContextResponse {
  return { questionKey, responseStatus: "answered", answerText, answerData: null };
}

function draftCheck(content: string, draftRules: unknown[]) {
  return structuredMarkdownV1.runDraftCheck(makeContext(content, draftRules));
}

function officialCheck(
  content: string,
  draftRules: unknown[],
  submissionRules: unknown[],
  responses: ValidationContextResponse[] = [],
) {
  return structuredMarkdownV1.runOfficialCheck(makeContext(content, draftRules, submissionRules, responses));
}

describe("sections_exist", () => {
  it("passes when every heading is present", () => {
    const content = "# Doc\n\n## Venture\n\n## Segment\n";
    const result = draftCheck(content, [
      {
        key: "required",
        type: "sections_exist",
        sections: [
          { level: 2, heading: "Venture" },
          { level: 2, heading: "Segment" },
        ],
      },
    ]);
    expect(result.passed).toBe(true);
  });

  it("fails when a heading is missing", () => {
    const content = "# Doc\n\n## Venture\n";
    const result = draftCheck(content, [
      {
        key: "required",
        type: "sections_exist",
        sections: [
          { level: 2, heading: "Venture" },
          { level: 2, heading: "Segment" },
        ],
      },
    ]);
    expect(result.passed).toBe(false);
    expect(result.issues[0]).toContain("Segment");
  });
});

describe("section_non_empty", () => {
  it("passes when the section has substantive content", () => {
    const content = "## Segment\n\nAustralian pre-seed founders raising $500k-$1.5M.\n";
    const result = draftCheck(content, [{ key: "segment", type: "section_non_empty", level: 2, heading: "Segment" }]);
    expect(result.passed).toBe(true);
  });

  it("rejects an unfilled <hint> block", () => {
    const content =
      "## Weakest gaps\n\n<Where the evidence base is thinnest. Be specific about which claim is unsupported, not which topic\nis under-researched.>\n";
    const result = draftCheck(content, [
      { key: "weakest_gaps", type: "section_non_empty", level: 2, heading: "Weakest gaps" },
    ]);
    expect(result.passed).toBe(false);
  });

  it("fails when the heading is missing entirely", () => {
    const content = "## Other Section\n\nSomething.\n";
    const result = draftCheck(content, [
      { key: "segment", type: "section_non_empty", level: 2, heading: "Segment" },
    ]);
    expect(result.passed).toBe(false);
  });
});

describe("range_named_items and the orRecordedUnknown escape", () => {
  const RULE = {
    key: "tier1",
    type: "range_named_items",
    level: 2,
    heading: "Tier 1 signals",
    minimum: 3,
    maximum: 5,
    orRecordedUnknown: true,
  };

  function withBody(body: string): string {
    return `## Tier 1 signals\n\n${body}\n`;
  }

  it("passes with 3-5 substantive items", () => {
    const content = withBody("- Search for pricing\n- Download a template\n- Ask in a forum\n");
    expect(draftCheck(content, [RULE]).passed).toBe(true);
  });

  it("fails with only 2 items and no recorded-unknown marker", () => {
    const content = withBody("- Search for pricing\n- Download a template\n");
    expect(draftCheck(content, [RULE]).passed).toBe(false);
  });

  it("fails with 6 items — the ceiling is enforced, not just the floor", () => {
    const content = withBody(
      "- one\n- two\n- three\n- four\n- five\n- six\n",
    );
    expect(draftCheck(content, [RULE]).passed).toBe(false);
  });

  it.each([
    "No evidence recorded yet.",
    "No customer behaviour observed yet.",
    "No specific channel has been identified yet.",
  ])("accepts the literal recorded-unknown phrasing: %s", (marker) => {
    const content = withBody(marker);
    expect(draftCheck(content, [RULE]).passed).toBe(true);
  });

  it("rejects TBD as a recorded-unknown escape", () => {
    const content = withBody("TBD");
    expect(draftCheck(content, [RULE]).passed).toBe(false);
  });

  it("rejects a confident but unevidenced assertion as a recorded-unknown escape", () => {
    const content = withBody("The founder believes this is probably true.");
    expect(draftCheck(content, [RULE]).passed).toBe(false);
  });

  it("does not apply the escape when orRecordedUnknown is not set", () => {
    const strictRule = { ...RULE, orRecordedUnknown: undefined };
    const content = withBody("No evidence recorded yet.");
    expect(draftCheck(content, [strictRule]).passed).toBe(false);
  });
});

describe("Five Whys ladder — range_named_items 3-5, and the skeleton must fail", () => {
  const RULE = {
    key: "ladder",
    type: "range_named_items",
    level: 2,
    heading: "Five Whys Ladder",
    minimum: 3,
    maximum: 5,
  };

  it("passes a filled 4-rung ladder", () => {
    const content = `## Five Whys Ladder

1. **Why does the report take three days?**

   Because the data lives in four systems.

2. **Why does the data live in four systems?**

   Because each team adopted its own tool.

3. **Why did each team adopt its own tool?**

   Because there was no shared budget for one system.

4. **Why was there no shared budget?**

   Because no one owns cross-team tooling decisions.
`;
    expect(draftCheck(content, [RULE]).passed).toBe(true);
  });

  it("fails a 2-rung ladder", () => {
    const content = `## Five Whys Ladder

1. **Why does the report take three days?**

   Because the data lives in four systems.

2. **Why does the data live in four systems?**

   Because each team adopted its own tool.
`;
    expect(draftCheck(content, [RULE]).passed).toBe(false);
  });

  it("fails the raw unfilled skeleton — three placeholder rungs must not satisfy the 3-5 range", () => {
    // This is the exact shape Problem-Statement.md ships before generation:
    // the rung's own heading line contains the question hint, and the
    // founder's answer line is a separate, still-unfilled placeholder.
    const skeleton = `## Five Whys Ladder

1. **Why <the question as it was asked>?**

   <the Founder's answer, in their words>

2. **Why <the question as it was asked>?**

   <the Founder's answer, in their words>

3. **Why <the question as it was asked>?**

   <the Founder's answer, in their words>
`;
    expect(draftCheck(skeleton, [RULE]).passed).toBe(false);
  });
});

describe("Why This Is Urgent — the pre-filled Axis table must not pass on row count alone", () => {
  const RANGE_ROWS = {
    key: "urgency_rows",
    type: "range_table_rows",
    level: 2,
    heading: "Why This Is Urgent",
    minimum: 3,
    maximum: 3,
  };
  const AXIS_SEQUENCE = {
    key: "axis_sequence",
    type: "table_column_exact_sequence",
    level: 2,
    heading: "Why This Is Urgent",
    column: "Axis",
    values: ["Frequency", "Cost", "Urgency"],
  };
  const REQUIRED_CELLS = {
    key: "urgency_cells",
    type: "table_required_cells",
    level: 2,
    heading: "Why This Is Urgent",
    requiredColumns: ["What the Founder described", "Reasoning"],
  };
  const SCORE_RANGE = {
    key: "urgency_score",
    type: "table_column_integer_range",
    level: 2,
    heading: "Why This Is Urgent",
    column: "Score (1-10)",
    minimum: 1,
    maximum: 10,
    allowBlank: true,
  };

  const UNFILLED_TABLE = `## Why This Is Urgent

| Axis | What the Founder described | Score (1-10) | Reasoning |
|---|---|---|---|
| Frequency | | | |
| Cost | | | |
| Urgency | | | |
`;

  const FILLED_TABLE = `## Why This Is Urgent

| Axis | What the Founder described | Score (1-10) | Reasoning |
|---|---|---|---|
| Frequency | Weekly | 7 | Founder described a weekly cadence. |
| Cost | A few hours each time | 6 | Time cost, not directly financial. |
| Urgency | Actively comparing tools | 8 | Observed active search behaviour. |
`;

  it("the unfilled table passes row count and axis sequence, but fails required cells", () => {
    expect(draftCheck(UNFILLED_TABLE, [RANGE_ROWS]).passed).toBe(true);
    expect(draftCheck(UNFILLED_TABLE, [AXIS_SEQUENCE]).passed).toBe(true);
    expect(draftCheck(UNFILLED_TABLE, [REQUIRED_CELLS]).passed).toBe(false);
  });

  it("a blank score cell passes with allowBlank, independent of required-cells failing", () => {
    expect(draftCheck(UNFILLED_TABLE, [SCORE_RANGE]).passed).toBe(true);
  });

  it("the fully filled table passes every rule", () => {
    expect(draftCheck(FILLED_TABLE, [RANGE_ROWS, AXIS_SEQUENCE, REQUIRED_CELLS, SCORE_RANGE]).passed).toBe(
      true,
    );
  });

  it("fails axis sequence when a row is repeated instead of following Frequency, Cost, Urgency", () => {
    const wrongOrder = `## Why This Is Urgent

| Axis | What the Founder described | Score (1-10) | Reasoning |
|---|---|---|---|
| Frequency | | | |
| Frequency | | | |
| Urgency | | | |
`;
    expect(draftCheck(wrongOrder, [AXIS_SEQUENCE]).passed).toBe(false);
  });

  it("rejects a score outside 1-10 even when present", () => {
    const badScore = `## Why This Is Urgent

| Axis | What the Founder described | Score (1-10) | Reasoning |
|---|---|---|---|
| Frequency | Weekly | 14 | Too high. |
`;
    expect(draftCheck(badScore, [SCORE_RANGE]).passed).toBe(false);
  });
});

describe("table_column_scored_reasoning — Evidence strength must carry reasoning inline", () => {
  const RULE = {
    key: "strength",
    type: "table_column_scored_reasoning",
    level: 2,
    heading: "Evidence Inventory",
    column: "Evidence strength (1-5)",
    minimum: 1,
    maximum: 5,
  };

  function withCell(cell: string): string {
    return `## Evidence Inventory\n\n| Source | Type | What it says | Evidence strength (1-5) |\n|---|---|---|---|\n| Interview | conversation | Customer described the workaround. | ${cell} |\n`;
  }

  it("passes an em-dash-separated score with reasoning", () => {
    expect(
      draftCheck(withCell("3 — Matching customer described a specific past experience."), [RULE]).passed,
    ).toBe(true);
  });

  it("passes a colon-separated score with reasoning", () => {
    expect(draftCheck(withCell("3: Matching customer described a specific past experience."), [RULE]).passed).toBe(
      true,
    );
  });

  it("passes a hyphen-separated score with a space on both sides", () => {
    expect(
      draftCheck(withCell("3 - Matching customer described a specific past experience."), [RULE]).passed,
    ).toBe(true);
  });

  it("rejects a bare score with no reasoning", () => {
    expect(draftCheck(withCell("3"), [RULE]).passed).toBe(false);
  });

  it('rejects "3-5" as malformed rather than reading it as score 3 with reasoning "5"', () => {
    expect(draftCheck(withCell("3-5"), [RULE]).passed).toBe(false);
  });

  it("rejects 3/5", () => {
    expect(draftCheck(withCell("3/5"), [RULE]).passed).toBe(false);
  });

  it("rejects a score outside the range even with reasoning present", () => {
    expect(draftCheck(withCell("6 — Strong evidence, clearly above range."), [RULE]).passed).toBe(false);
  });

  it("passes vacuously when the table has no data rows", () => {
    const empty = "## Evidence Inventory\n\n| Source | Type | What it says | Evidence strength (1-5) |\n|---|---|---|---|\n";
    expect(draftCheck(empty, [RULE]).passed).toBe(true);
  });
});

describe("escaped pipes in table cells do not misalign columns", () => {
  const REQUIRED_CELLS = {
    key: "cells",
    type: "table_required_cells",
    level: 2,
    heading: "Evidence Inventory",
    requiredColumns: ["Source", "Type", "What it says", "Evidence strength (1-5)"],
  };
  const SCORE = {
    key: "score",
    type: "table_column_scored_reasoning",
    level: 2,
    heading: "Evidence Inventory",
    column: "Evidence strength (1-5)",
    minimum: 1,
    maximum: 5,
  };

  const content = `## Evidence Inventory

| Source | Type | What it says | Evidence strength (1-5) |
|---|---|---|---|
| Interview | conversation | The customer said "A \\| B creates the delay" | 3 — Direct account of a specific past event. |
`;

  it("keeps every column aligned despite the escaped pipe in a cell", () => {
    expect(draftCheck(content, [REQUIRED_CELLS]).passed).toBe(true);
    expect(draftCheck(content, [SCORE]).passed).toBe(true);
  });
});

describe("table_column_enum", () => {
  const RULE = {
    key: "type_enum",
    type: "table_column_enum",
    level: 2,
    heading: "Evidence Inventory",
    column: "Type",
    allowed: ["data", "conversation", "observation", "signal"],
  };

  it("passes an allowed value", () => {
    const content =
      "## Evidence Inventory\n\n| Source | Type | What it says | Evidence strength (1-5) |\n|---|---|---|---|\n| Interview | conversation | X | 3 — Y. |\n";
    expect(draftCheck(content, [RULE]).passed).toBe(true);
  });

  it("fails a value outside the enum", () => {
    const content =
      "## Evidence Inventory\n\n| Source | Type | What it says | Evidence strength (1-5) |\n|---|---|---|---|\n| Interview | hearsay | X | 3 — Y. |\n";
    expect(draftCheck(content, [RULE]).passed).toBe(false);
  });
});

describe("table_column_integer_range with allowBlank", () => {
  const RULE = {
    key: "signal_strength",
    type: "table_column_integer_range",
    level: 2,
    heading: "Experiments",
    column: "Expected evidence signal strength (1-5)",
    minimum: 1,
    maximum: 5,
    allowBlank: true,
  };

  function withCell(cell: string): string {
    return `## Experiments\n\n| Experiment | Expected evidence signal strength (1-5) |\n|---|---|\n| Interview 5 customers | ${cell} |\n`;
  }

  it("passes an in-range integer", () => {
    expect(draftCheck(withCell("4"), [RULE]).passed).toBe(true);
  });

  it("fails a non-numeric value like High", () => {
    expect(draftCheck(withCell("High"), [RULE]).passed).toBe(false);
  });

  it("fails a value above the range", () => {
    expect(draftCheck(withCell("6"), [RULE]).passed).toBe(false);
  });

  it("passes a blank cell when allowBlank is set", () => {
    expect(draftCheck(withCell(""), [RULE]).passed).toBe(true);
  });

  it("fails a blank cell when allowBlank is not set", () => {
    const strict = { ...RULE, allowBlank: undefined };
    expect(draftCheck(withCell(""), [strict]).passed).toBe(false);
  });
});

describe("label_present", () => {
  it("rejects an unfilled placeholder label", () => {
    const content = "## Validation Status\n\n**Current level:** <one of the five below>\n";
    const result = draftCheck(content, [
      {
        key: "current_level",
        type: "label_present",
        label: "Current level",
        scope: { level: 2, heading: "Validation Status" },
      },
    ]);
    expect(result.passed).toBe(false);
  });

  it("accepts the bold-label form", () => {
    const content = "## Validation Status\n\n**Current level:** Assumed\n";
    const result = draftCheck(content, [
      { key: "current_level", type: "label_present", label: "Current level" },
    ]);
    expect(result.passed).toBe(true);
  });

  it("accepts the list-item label form used by every template's Venture section", () => {
    const content = "## Venture\n- Venture name: Nobel AI\n";
    const result = draftCheck(content, [
      { key: "venture_name", type: "label_present", label: "Venture name", scope: { level: 2, heading: "Venture" } },
    ]);
    expect(result.passed).toBe(true);
  });

  it("rejects an unfilled list-item label", () => {
    const content = "## Venture\n- Venture name:\n";
    const result = draftCheck(content, [
      { key: "venture_name", type: "label_present", label: "Venture name", scope: { level: 2, heading: "Venture" } },
    ]);
    expect(result.passed).toBe(false);
  });
});

describe("scoped labels disambiguate a duplicate label across sections", () => {
  // Evidence-Of-Unmet-Need.md's real shape: "Current level" appears once
  // under Evidence Maturity Level and again under Validation Status.
  const content = `## Evidence Maturity Level

**Current level:** Primary research

## Validation Status

**Current level:** Demand signal
`;

  it("reads the first occurrence when scoped to Evidence Maturity Level", () => {
    const result = draftCheck(content, [
      {
        key: "maturity_level",
        type: "label_enum",
        label: "Current level",
        scope: { level: 2, heading: "Evidence Maturity Level" },
        allowed: ["primary_research"],
      },
    ]);
    expect(result.passed).toBe(true);
  });

  it("reads the second occurrence when scoped to Validation Status", () => {
    const result = draftCheck(content, [
      {
        key: "validation_status_level",
        type: "label_enum",
        label: "Current level",
        scope: { level: 2, heading: "Validation Status" },
        allowed: ["demand_signal"],
      },
    ]);
    expect(result.passed).toBe(true);
  });
});

describe("three-way enum spelling equivalence", () => {
  const RULE = {
    key: "level_enum",
    type: "label_enum",
    label: "Current level",
    allowed: ["secondary_research"],
  };

  it.each([
    "secondary_research",
    "Secondary research",
    "2 — Secondary research",
  ])("normalises %s to match the stored enum value", (spelling) => {
    const content = `**Current level:** ${spelling}\n`;
    expect(draftCheck(content, [RULE]).passed).toBe(true);
  });
});

describe("labels_agree", () => {
  const RULE = {
    key: "levels_agree",
    type: "labels_agree",
    labelA: { label: "Current level", scope: { level: 2, heading: "Evidence Maturity Level" } },
    labelB: { label: "Current level", scope: { level: 2, heading: "Validation Status" } },
  };

  it("passes when both mirrored labels agree", () => {
    const content = `## Evidence Maturity Level\n\n**Current level:** Demand signal\n\n## Validation Status\n\n**Current level:** Demand signal\n`;
    expect(officialCheck(content, [], [RULE]).passed).toBe(true);
  });

  it("fails when the two disagree", () => {
    const content = `## Evidence Maturity Level\n\n**Current level:** Demand signal\n\n## Validation Status\n\n**Current level:** Primary research\n`;
    expect(officialCheck(content, [], [RULE]).passed).toBe(false);
  });
});

describe("label_matches_response — parses the CONFIRMED ANSWER save protocol", () => {
  const RULE = {
    key: "status_matches",
    type: "label_matches_response",
    label: "Current level",
    scope: { level: 2, heading: "Validation Status" },
    responseKey: "validation_status",
  };

  it("matches a plain, unwrapped answer", () => {
    const content = "## Validation Status\n\n**Current level:** Assumed\n";
    const responses = [response("validation_status", "assumed")];
    expect(officialCheck(content, [], [RULE], responses).passed).toBe(true);
  });

  it("matches when the response is wrapped in the full save-protocol metadata shape", () => {
    const content = "## Validation Status\n\n**Current level:** Assumed\n";
    const wrapped = `CONFIRMED ANSWER
assumed

OBSERVATION BASIS
None recorded.

ASSUMPTIONS
Founder has not yet interviewed a matching customer.

UNKNOWNS
None recorded.

CARRY-FORWARD CONTEXT
None.`;
    const responses = [response("validation_status", wrapped)];
    expect(officialCheck(content, [], [RULE], responses).passed).toBe(true);
  });

  it("fails when the label and the confirmed response disagree", () => {
    const content = "## Validation Status\n\n**Current level:** Interviewed\n";
    const responses = [response("validation_status", "assumed")];
    expect(officialCheck(content, [], [RULE], responses).passed).toBe(false);
  });
});

describe("labels_match_first_table_row — Start Here must mirror Experiments row 1", () => {
  const RULE = {
    key: "start_here_matches_row_1",
    type: "labels_match_first_table_row",
    table: { level: 2, heading: "Experiments" },
    mappings: [
      { label: "What counts as a pass", scope: { level: 2, heading: "Start Here" }, column: "Pass condition" },
      { label: "What counts as a fail", scope: { level: 2, heading: "Start Here" }, column: "Fail condition" },
    ],
  };

  const EXPERIMENTS_TABLE = `## Experiments

| Experiment | Pass condition | Fail condition |
|---|---|---|
| Interview 5 customers | 3 of 5 confirm the problem | 0 of 5 confirm the problem |
| Send a survey | 20 responses | Fewer than 5 responses |
`;

  it("passes when Start Here matches row 1 exactly", () => {
    const content = `${EXPERIMENTS_TABLE}\n## Start Here\n\n**What counts as a pass:** 3 of 5 confirm the problem\n\n**What counts as a fail:** 0 of 5 confirm the problem\n`;
    expect(officialCheck(content, [], [RULE]).passed).toBe(true);
  });

  it("fails when Start Here's pass condition does not match row 1", () => {
    const content = `${EXPERIMENTS_TABLE}\n## Start Here\n\n**What counts as a pass:** Something else entirely\n\n**What counts as a fail:** 0 of 5 confirm the problem\n`;
    expect(officialCheck(content, [], [RULE]).passed).toBe(false);
  });

  it("fails when Start Here's fail condition does not match row 1", () => {
    const content = `${EXPERIMENTS_TABLE}\n## Start Here\n\n**What counts as a pass:** 3 of 5 confirm the problem\n\n**What counts as a fail:** Something else entirely\n`;
    expect(officialCheck(content, [], [RULE]).passed).toBe(false);
  });

  it("passes vacuously when the Experiments table has no data rows", () => {
    const content = "## Experiments\n\n| Experiment | Pass condition | Fail condition |\n|---|---|---|\n\n## Start Here\n\n**What counts as a pass:** X\n";
    expect(officialCheck(content, [], [RULE]).passed).toBe(true);
  });
});

describe("range_table_rows / minimum_table_rows with orRecordedUnknown", () => {
  it("an inventory with no data rows passes only with the recorded-unknown escape", () => {
    const rule = {
      key: "inventory_rows",
      type: "minimum_table_rows",
      level: 2,
      heading: "Evidence Inventory",
      minimum: 1,
      orRecordedUnknown: true,
    };
    const empty =
      "## Evidence Inventory\n\n| Source | Type | What it says | Evidence strength (1-5) |\n|---|---|---|---|\n\nNo evidence recorded yet.\n";
    const emptyNoMarker =
      "## Evidence Inventory\n\n| Source | Type | What it says | Evidence strength (1-5) |\n|---|---|---|---|\n";
    expect(draftCheck(empty, [rule]).passed).toBe(true);
    expect(draftCheck(emptyNoMarker, [rule]).passed).toBe(false);
  });

  it("2-3 experiments pass, 4 fail", () => {
    const rule = {
      key: "experiment_rows",
      type: "range_table_rows",
      level: 2,
      heading: "Experiments",
      minimum: 2,
      maximum: 3,
    };
    const twoRows = "## Experiments\n\n| Experiment |\n|---|\n| A |\n| B |\n";
    const fourRows = "## Experiments\n\n| Experiment |\n|---|\n| A |\n| B |\n| C |\n| D |\n";
    expect(draftCheck(twoRows, [rule]).passed).toBe(true);
    expect(draftCheck(fourRows, [rule]).passed).toBe(false);
  });
});

describe("table_column_exact_sequence — Evidence Maturity Level's locked reference table", () => {
  const RULE = {
    key: "level_scaffolding",
    type: "table_column_exact_sequence",
    level: 2,
    heading: "Evidence Maturity Level",
    column: "Level",
    values: [
      "1 — Assumption",
      "2 — Secondary research",
      "3 — Primary research",
      "4 — Demand signal",
      "5 — Paying",
    ],
  };
  const RANGE_ROWS = {
    key: "level_scaffolding_rows",
    type: "range_table_rows",
    level: 2,
    heading: "Evidence Maturity Level",
    minimum: 5,
    maximum: 5,
  };

  it("passes the intact reference table", () => {
    const content = `## Evidence Maturity Level

| Level |
|---|
| 1 — Assumption |
| 2 — Secondary research |
| 3 — Primary research |
| 4 — Demand signal |
| 5 — Paying |
`;
    expect(draftCheck(content, [RULE, RANGE_ROWS]).passed).toBe(true);
  });

  it("fails if a row is renamed or the table shrinks", () => {
    const content = `## Evidence Maturity Level

| Level |
|---|
| 1 — Assumption |
| 2 — Secondary research |
| 3 — Primary research |
| 4 — Demand signal |
`;
    expect(draftCheck(content, [RANGE_ROWS]).passed).toBe(false);
  });
});
