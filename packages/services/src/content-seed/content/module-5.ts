import type {
  ArtifactContent,
  ModuleContent,
  QuestionContent,
} from "../types.js";

// Module 5 — Epics & user stories.
//
// Canonical source is the reviewed Markdown under
// packages/toolkit-content/skills/module-05-epics-user-stories/ — this file is the
// seeded copy, kept in sync by anti-drift.test.ts.
//
// Module 5 has no website Documents step. Founder-supplied material is
// shared directly in chat, transcribed and saved via save_prep_extract,
// then read back via get_module_context / get_prep_document.

const EPIC_CHARTER_TEMPLATE = `# Epic Charter

## Venture
- Venture name:
- Product name / working title:

## Epic 1

**Title:**

**Goal:** As a …, I want to …, so that …

**Success metric:**

### Stories

#### Story 1.1

**Story:** As a …, I want to …, so that …

**INVEST notes:**

**Acceptance criteria:**

1. Given …, When …, Then …
2. Given …, When …, Then …

## Epic 2

**Title:**

**Goal:** As a …, I want to …, so that …

**Success metric:**

### Stories

#### Story 2.1

**Story:** As a …, I want to …, so that …

**INVEST notes:**

**Acceptance criteria:**

1. Given …, When …, Then …
2. Given …, When …, Then …

## Epic 3

**Title:**

**Goal:** As a …, I want to …, so that …

**Success metric:**

### Stories

#### Story 3.1

**Story:** As a …, I want to …, so that …

**INVEST notes:**

**Acceptance criteria:**

1. Given …, When …, Then …
2. Given …, When …, Then …
`;

const SPRINT_BACKLOG_TEMPLATE = `# Sprint Backlog

## Venture
- Venture name:
- Product name / working title:

## Scored backlog

| Priority | Epic | Story | Customer value (1–5) | Confidence (1–5) | Effort (1–5, 5=easiest) | Score | In Sprint 1? | MLP? |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |
| | | | | | | | | |
| | | | | | | | | |

## Sprint 1 commitment

-

## Why this is the Loveable cut

### Above the line

-

### Cut (below the line)

-
`;

const MODULE_5_QUESTIONS: QuestionContent[] = [
  {
    questionKey: "epics",
    sequenceIndex: 1,
    questionGroup: "epics",
    questionText:
      "For each of the three Minimum Loveable features, what is the epic title, customer-goal statement, and success metric?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "epic_priority",
    sequenceIndex: 2,
    questionGroup: "stories",
    questionText: "Which one epic should be broken into user stories first?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "user_stories",
    sequenceIndex: 3,
    questionGroup: "stories",
    questionText:
      "What are the 3–5 independently shippable user stories under each Founder-selected epic, and what INVEST concerns apply?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "acceptance_criteria",
    sequenceIndex: 4,
    questionGroup: "stories",
    questionText:
      "What are the 2–3 Gherkin acceptance criteria for each story the Founder selected to refine?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "story_scores",
    sequenceIndex: 5,
    questionGroup: "scoring",
    questionText:
      "For each user story, what are the customer-value, confidence, and effort scores (1–5)?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "mlp_cut",
    sequenceIndex: 6,
    questionGroup: "scoring",
    questionText:
      "Which stories sit above the Minimum Loveable Product line, which are cut, and why?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
];

const EPIC_CHARTER_ARTIFACT: ArtifactContent = {
  artifactKey: "epic_charter",
  sequenceIndex: 1,
  name: "Epic Charter",
  description:
    "Three epics mapped to Module 4 features, with stories and Gherkin only for the epics and stories the Founder chose to break down.",
  isRequired: true,
  artifactType: "document",
  sourceFormat: "markdown",
  outputFormat: "markdown",
  requiredFilename: "Epic-Charter.md",
  rendererKey: null,
  validatorKey: "structured_markdown_v1",
  allowedMimeTypes: ["text/markdown", "text/plain"],
  maxFileSizeBytes: 262_144,
  maxFiles: 1,
  outputConfig: {
    schemaVersion: 1,
    templateFormat: "markdown",
    templateMarkdown: EPIC_CHARTER_TEMPLATE,
  },
  validationConfig: {
    schemaVersion: 1,
    draftRules: [
      {
        key: "required_sections",
        type: "sections_exist",
        sections: [
          { level: 2, heading: "Venture" },
          { level: 2, heading: "Epic 1" },
          { level: 2, heading: "Epic 2" },
          { level: 2, heading: "Epic 3" },
        ],
      },
      {
        key: "venture_name",
        type: "label_present",
        label: "Venture name",
        scope: { level: 2, heading: "Venture" },
      },
      {
        key: "product_name",
        type: "label_present",
        label: "Product name / working title",
        scope: { level: 2, heading: "Venture" },
      },
      {
        key: "epic_1_title",
        type: "label_present",
        label: "Title",
        scope: { level: 2, heading: "Epic 1" },
      },
      {
        key: "epic_2_title",
        type: "label_present",
        label: "Title",
        scope: { level: 2, heading: "Epic 2" },
      },
      {
        key: "epic_3_title",
        type: "label_present",
        label: "Title",
        scope: { level: 2, heading: "Epic 3" },
      },
    ],
    submissionRules: [],
  },
};

const SPRINT_BACKLOG_ARTIFACT: ArtifactContent = {
  artifactKey: "sprint_backlog",
  sequenceIndex: 2,
  name: "Sprint Backlog",
  description:
    "Scored backlog with Sprint 1 commitment and the reasoning behind the Minimum Loveable cut.",
  isRequired: true,
  artifactType: "document",
  sourceFormat: "markdown",
  outputFormat: "markdown",
  requiredFilename: "Sprint-Backlog.md",
  rendererKey: null,
  validatorKey: "structured_markdown_v1",
  allowedMimeTypes: ["text/markdown", "text/plain"],
  maxFileSizeBytes: 262_144,
  maxFiles: 1,
  outputConfig: {
    schemaVersion: 1,
    templateFormat: "markdown",
    templateMarkdown: SPRINT_BACKLOG_TEMPLATE,
  },
  validationConfig: {
    schemaVersion: 1,
    draftRules: [
      {
        key: "required_sections",
        type: "sections_exist",
        sections: [
          { level: 2, heading: "Venture" },
          { level: 2, heading: "Scored backlog" },
          { level: 2, heading: "Sprint 1 commitment" },
          { level: 2, heading: "Why this is the Loveable cut" },
          { level: 3, heading: "Above the line" },
          { level: 3, heading: "Cut (below the line)" },
        ],
      },
      {
        key: "venture_name",
        type: "label_present",
        label: "Venture name",
        scope: { level: 2, heading: "Venture" },
      },
      {
        key: "product_name",
        type: "label_present",
        label: "Product name / working title",
        scope: { level: 2, heading: "Venture" },
      },
      {
        key: "scored_backlog_rows",
        type: "minimum_table_rows",
        level: 2,
        heading: "Scored backlog",
        minimum: 1,
      },
      {
        key: "scored_backlog_cells",
        type: "table_required_cells",
        level: 2,
        heading: "Scored backlog",
        requiredColumns: [
          "Priority",
          "Epic",
          "Story",
          "Customer value (1–5)",
          "Confidence (1–5)",
          "Effort (1–5, 5=easiest)",
          "Score",
          "In Sprint 1?",
          "MLP?",
        ],
      },
      {
        key: "sprint_1_present",
        type: "section_non_empty",
        level: 2,
        heading: "Sprint 1 commitment",
      },
      {
        key: "above_the_line_present",
        type: "section_non_empty",
        level: 3,
        heading: "Above the line",
      },
      {
        key: "cut_present",
        type: "section_non_empty",
        level: 3,
        heading: "Cut (below the line)",
      },
    ],
    submissionRules: [],
  },
};

export const MODULE_5_CONTENT: ModuleContent = {
  moduleKey: "module-05-epics-user-stories",
  sequenceIndex: 5,
  title: "Epics & user stories",
  subtitle:
    "Turn the three Minimum Loveable features into a development-ready backlog",
  description:
    "Turns Module 4's three features into epics, INVEST user stories with Gherkin acceptance criteria, a scored priority order, and an explicit Minimum Loveable Product line.",
  objective:
    "Produce a backlog a development team can ship, with every story a customer outcome rather than an engineering task.",
  moduleType: "standard",
  isRequired: true,
  allowRevisions: true,
  completionMode: "artifact_and_confirmation",
  estimatedMinutes: 50,
  isPublishable: true,
  questions: MODULE_5_QUESTIONS,
  artifacts: [EPIC_CHARTER_ARTIFACT, SPRINT_BACKLOG_ARTIFACT],
};
