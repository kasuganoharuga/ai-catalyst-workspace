import type {
  ArtifactContent,
  ModuleContent,
  QuestionContent,
} from "../types.js";

// Ported from skills/module-03-problem-statement/prompts/module-03-prompt-set.md
// (§1 field ownership, §3 question rows, §5 artifact generator) and the two
// templates it names. Two artefacts: Problem-Statement.md records the
// root-cause hypothesis; Problem-Interview-Guide.md prepares five interview
// questions. Module 3 does not run the interviews or read their results —
// that is the module that follows.

const PROBLEM_STATEMENT_TEMPLATE = `# Problem Statement

## Venture
- Venture name:

## Statement

### Root-cause version

### Draft version

## Five Whys Ladder

1.
2.
3.

## Root Cause

## Why This Is Urgent

| Axis | What the Founder described | Score (1–10) | Reasoning |
|---|---|---|---|
| Frequency — how often the problem occurs | | | |
| Cost — time, money or missed opportunity each time | | | |
| Urgency — how actively they are looking for a solution | | | |

**Verdict:**

## What Customers Do Today

| Tool or workaround | What it does | Where it falls short |
|---|---|---|
| | | |
| | | |
| | | |

## Validation Status

This section records the evidence available when this version of the Problem Statement was created.
It is a current snapshot, not a final validation verdict.

**Current level:** Assumed / Interviewed / Validated

### Based on observation

### Founder assumptions

### Important unknowns

### Contradicting evidence

### Highest-priority validation questions
`;

const PROBLEM_INTERVIEW_GUIDE_TEMPLATE = `# Problem Interview Guide

## Venture
- Venture name:

## Interview Target

## What This Interview Tests

## Five Interview Questions

1.
2.
3.
4.
5.

## Mom Test Rules

-
-
-
-

## Pass Bar

**For this five-interview validation round, grade each lane separately. Label every condition
Problem, Root cause, or Urgency. Typical bar: at least 3 of 5 interviews satisfy each lane's
conditions below (calibrate windows to the confirmed pain cadence):**

-
-
-

## Kill Criteria

**Three patterns. True kills mean the problem is not worth pursuing and scope must change.
Patterns that only falsify the current root-cause hypothesis must say to re-run Five Whys / revise
the hypothesis — not to kill the problem:**

1.
2.
3.

## After Each Call

- Write the verbatim notes within 30 minutes, while they are still fresh.
- Record the customer's own words rather than replacing them with a summary. The summary is where
  the evidence quietly disappears.
- Record anything that contradicted the problem statement, especially when it was inconvenient.
- Keep each interview as a separate note.
- Keep the completed notes together — the next module reviews them.

## Where Results Go

Interview results are not recorded in this guide. Run the five conversations, keep the verbatim
notes, and bring them into the next module, which reviews the evidence they produced.

Three or four completed interviews are still worth reviewing — they simply have not completed this
round, so the pass bar above has not been met either way. Bring whatever you have.
`;

const VALIDATION_STATUS_OPTIONS = [
  { value: "assumed", label: "Assumed" },
  { value: "interviewed", label: "Interviewed" },
  { value: "validated", label: "Validated" },
];

// One question per confirmed field. Block 3 (five_whys_ladder / root_cause)
// takes three to five founder turns for one confirmation — the one
// deliberate exception to "a block asks once" (see §1). Block 4
// (problem_statement) is a convergence block: nothing new is collected, the
// Founder confirms the restated root-cause statement.
const PROBLEM_STATEMENT_QUESTIONS: QuestionContent[] = [
  {
    questionKey: "problem_draft",
    sequenceIndex: 1,
    questionGroup: "statement",
    questionText:
      "In the Founder's own words, what does the beachhead customer struggle with, and what does it cost them when it happens?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "current_alternatives",
    sequenceIndex: 2,
    questionGroup: "current_alternatives",
    questionText:
      "What tools, workarounds, manual processes and paid products does this customer use today, and where does each fall short?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "five_whys_ladder",
    sequenceIndex: 3,
    questionGroup: "five_whys",
    questionText:
      "Asked in sequence, each building on the last: why does this problem exist?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "root_cause",
    sequenceIndex: 4,
    questionGroup: "five_whys",
    questionText:
      "What is the current root-cause hypothesis at the bottom of the ladder — the reason the problem may persist rather than only the reason it hurts?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "problem_statement",
    sequenceIndex: 5,
    questionGroup: "statement",
    questionText:
      "Restated from the current root-cause hypothesis: who struggles with what, because of which underlying cause, and with what consequence?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "pain_intensity",
    sequenceIndex: 6,
    questionGroup: "why_this_is_urgent",
    questionText:
      "Scored in turn: how often does this problem occur, what does it cost each time, and how actively is the customer looking for a solution — each with an evidence basis?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "priority_evidence",
    sequenceIndex: 7,
    questionGroup: "why_this_is_urgent",
    questionText:
      "What evidence shows this is among the most important problems this customer faces right now?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "validation_status",
    sequenceIndex: 8,
    questionGroup: "validation",
    questionText:
      "What is the highest evidence level reached for this exact problem?",
    helpText: null,
    placeholderText: null,
    responseType: "single_choice",
    isRequired: true,
    allowSkip: false,
    options: VALIDATION_STATUS_OPTIONS,
    conditions: {},
  },
];

const PROBLEM_STATEMENT_ARTIFACT: ArtifactContent = {
  artifactKey: "problem_statement",
  sequenceIndex: 1,
  name: "Problem Statement",
  description:
    "Root-cause problem statement alongside the founder's original draft, the Five Whys ladder, pain intensity and priority evidence, current alternatives, and an internal Validation Status.",
  isRequired: true,
  artifactType: "document",
  sourceFormat: "markdown",
  outputFormat: "markdown",
  requiredFilename: "Problem-Statement.md",
  rendererKey: "problem_statement_html_v1",
  validatorKey: "structured_markdown_v1",
  allowedMimeTypes: ["text/markdown", "text/plain"],
  maxFileSizeBytes: 262_144,
  maxFiles: 1,
  outputConfig: {
    schemaVersion: 1,
    templateFormat: "markdown",
    templateMarkdown: PROBLEM_STATEMENT_TEMPLATE,
  },
  validationConfig: {
    schemaVersion: 1,
    draftRules: [
      {
        key: "required_sections",
        type: "sections_exist",
        sections: [
          { level: 2, heading: "Venture" },
          { level: 2, heading: "Statement" },
          { level: 2, heading: "Five Whys Ladder" },
          { level: 2, heading: "Root Cause" },
          { level: 2, heading: "Why This Is Urgent" },
          { level: 2, heading: "What Customers Do Today" },
          { level: 2, heading: "Validation Status" },
        ],
      },
      {
        key: "venture_name",
        type: "label_present",
        label: "Venture name",
        scope: { level: 2, heading: "Venture" },
      },
      {
        key: "root_cause_version_present",
        type: "section_non_empty",
        level: 3,
        heading: "Root-cause version",
      },
      {
        key: "draft_version_present",
        type: "section_non_empty",
        level: 3,
        heading: "Draft version",
      },
      {
        key: "root_cause_present",
        type: "section_non_empty",
        level: 2,
        heading: "Root Cause",
      },
      {
        key: "five_whys_range",
        type: "range_named_items",
        level: 2,
        heading: "Five Whys Ladder",
        minimum: 3,
        maximum: 5,
      },
      {
        key: "urgency_row_count",
        type: "range_table_rows",
        level: 2,
        heading: "Why This Is Urgent",
        minimum: 3,
        maximum: 3,
      },
      {
        key: "urgency_axis_sequence",
        type: "table_column_exact_sequence",
        level: 2,
        heading: "Why This Is Urgent",
        column: "Axis",
        values: [
          "Frequency — how often the problem occurs",
          "Cost — time, money or missed opportunity each time",
          "Urgency — how actively they are looking for a solution",
        ],
      },
      {
        key: "urgency_required_cells",
        type: "table_required_cells",
        level: 2,
        heading: "Why This Is Urgent",
        requiredColumns: ["What the Founder described", "Reasoning"],
      },
      {
        key: "urgency_score_range",
        type: "table_column_integer_range",
        level: 2,
        heading: "Why This Is Urgent",
        column: "Score (1–10)",
        minimum: 1,
        maximum: 10,
        allowBlank: true,
      },
      {
        key: "verdict_present",
        type: "label_present",
        label: "Verdict",
        scope: { level: 2, heading: "Why This Is Urgent" },
      },
      {
        key: "alternatives_row_count",
        type: "minimum_table_rows",
        level: 2,
        heading: "What Customers Do Today",
        minimum: 1,
        orRecordedUnknown: true,
      },
      {
        key: "alternatives_required_cells",
        type: "table_required_cells",
        level: 2,
        heading: "What Customers Do Today",
        requiredColumns: [
          "Tool or workaround",
          "What it does",
          "Where it falls short",
        ],
      },
      {
        key: "based_on_observation_present",
        type: "section_non_empty",
        level: 3,
        heading: "Based on observation",
      },
      {
        key: "founder_assumptions_present",
        type: "section_non_empty",
        level: 3,
        heading: "Founder assumptions",
      },
      {
        key: "important_unknowns_present",
        type: "section_non_empty",
        level: 3,
        heading: "Important unknowns",
      },
      {
        key: "contradicting_evidence_present",
        type: "section_non_empty",
        level: 3,
        heading: "Contradicting evidence",
      },
      {
        key: "validation_questions_present",
        type: "section_non_empty",
        level: 3,
        heading: "Highest-priority validation questions",
      },
      {
        key: "current_level_enum",
        type: "label_enum",
        label: "Current level",
        scope: { level: 2, heading: "Validation Status" },
        allowed: ["assumed", "interviewed", "validated"],
      },
    ],
    submissionRules: [
      {
        key: "current_level_matches_response",
        type: "label_matches_response",
        label: "Current level",
        scope: { level: 2, heading: "Validation Status" },
        responseKey: "validation_status",
      },
    ],
  },
};

const PROBLEM_INTERVIEW_GUIDE_ARTIFACT: ArtifactContent = {
  artifactKey: "problem_interview_guide",
  sequenceIndex: 2,
  name: "Problem Interview Guide",
  description:
    "Five past-behaviour interview questions testing a recent occurrence, frequency and impact, prior spending, the root-cause mechanism and priority — plus Mom Test rules, a pre-set pass bar and kill criteria. Generated from the confirmed Problem Statement fields; interview results are read by the next module, never here.",
  isRequired: true,
  artifactType: "document",
  sourceFormat: "markdown",
  outputFormat: "markdown",
  requiredFilename: "Problem-Interview-Guide.md",
  rendererKey: "interview_guide_html_v1",
  validatorKey: "structured_markdown_v1",
  allowedMimeTypes: ["text/markdown", "text/plain"],
  maxFileSizeBytes: 262_144,
  maxFiles: 1,
  outputConfig: {
    schemaVersion: 1,
    templateFormat: "markdown",
    templateMarkdown: PROBLEM_INTERVIEW_GUIDE_TEMPLATE,
  },
  validationConfig: {
    schemaVersion: 1,
    draftRules: [
      {
        key: "required_sections",
        type: "sections_exist",
        sections: [
          { level: 2, heading: "Venture" },
          { level: 2, heading: "Interview Target" },
          { level: 2, heading: "What This Interview Tests" },
          { level: 2, heading: "Five Interview Questions" },
          { level: 2, heading: "Mom Test Rules" },
          { level: 2, heading: "Pass Bar" },
          { level: 2, heading: "Kill Criteria" },
          { level: 2, heading: "After Each Call" },
          { level: 2, heading: "Where Results Go" },
        ],
      },
      {
        key: "venture_name",
        type: "label_present",
        label: "Venture name",
        scope: { level: 2, heading: "Venture" },
      },
      {
        key: "interview_target_present",
        type: "section_non_empty",
        level: 2,
        heading: "Interview Target",
      },
      {
        key: "what_this_tests_present",
        type: "section_non_empty",
        level: 2,
        heading: "What This Interview Tests",
      },
      {
        key: "five_questions_exact",
        type: "range_named_items",
        level: 2,
        heading: "Five Interview Questions",
        minimum: 5,
        maximum: 5,
      },
      {
        key: "mom_test_rules_range",
        type: "range_named_items",
        level: 2,
        heading: "Mom Test Rules",
        minimum: 4,
        maximum: 5,
      },
      {
        key: "pass_bar_range",
        type: "range_named_items",
        level: 2,
        heading: "Pass Bar",
        minimum: 3,
        maximum: 4,
      },
      {
        key: "kill_criteria_exact",
        type: "range_named_items",
        level: 2,
        heading: "Kill Criteria",
        minimum: 3,
        maximum: 3,
      },
      {
        key: "after_each_call_present",
        type: "section_non_empty",
        level: 2,
        heading: "After Each Call",
      },
      {
        key: "where_results_go_present",
        type: "section_non_empty",
        level: 2,
        heading: "Where Results Go",
      },
    ],
    submissionRules: [],
  },
};

export const MODULE_3_CONTENT: ModuleContent = {
  moduleKey: "module-03-problem-statement",
  sequenceIndex: 3,
  title: "Problem & Five Whys",
  subtitle:
    "Drive the beachhead customer's surface complaint down to a structural root cause, and prepare five interview questions to test it",
  description:
    "Eight confirmed structured answers saved field by field, a root-cause Problem Statement, and a Problem Interview Guide with five past-behaviour questions. The module prepares the interviews; it does not run them or read their results.",
  objective:
    "Drive the beachhead customer's surface complaint down to a structural root cause, and turn it into five interview questions the Founder can take to real customers.",
  moduleType: "standard",
  isRequired: true,
  allowRevisions: true,
  completionMode: "artifact_and_confirmation",
  estimatedMinutes: 45,
  isPublishable: true,
  questions: PROBLEM_STATEMENT_QUESTIONS,
  artifacts: [PROBLEM_STATEMENT_ARTIFACT, PROBLEM_INTERVIEW_GUIDE_ARTIFACT],
};
