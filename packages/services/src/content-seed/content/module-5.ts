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
    questionText:
      "Which epic should be broken into user stories first, and in what order should the three epics be tackled?",
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
      "What are the 3–5 independently shippable user stories under each epic, and what INVEST concerns apply?",
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
      "What are the 2–3 Gherkin acceptance criteria for each user story?",
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
    "Three epics, each with its confirmed user stories, INVEST notes and Gherkin acceptance criteria.",
  isRequired: true,
  artifactType: "document",
  sourceFormat: "markdown",
  outputFormat: "markdown",
  requiredFilename: "Epic-Charter.md",
  rendererKey: null,
  validatorKey: null,
  allowedMimeTypes: ["text/markdown", "text/plain"],
  maxFileSizeBytes: 262_144,
  maxFiles: 1,
  outputConfig: {
    schemaVersion: 1,
    templateFormat: "markdown",
    templateMarkdown: EPIC_CHARTER_TEMPLATE,
  },
  validationConfig: {},
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
  validatorKey: null,
  allowedMimeTypes: ["text/markdown", "text/plain"],
  maxFileSizeBytes: 262_144,
  maxFiles: 1,
  outputConfig: {
    schemaVersion: 1,
    templateFormat: "markdown",
    templateMarkdown: SPRINT_BACKLOG_TEMPLATE,
  },
  validationConfig: {},
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
