import type {
  ArtifactContent,
  ModuleContent,
  QuestionContent,
} from "../types.js";

// Module 6 — Competitive analysis.
//
// Canonical source is the reviewed Markdown under
// packages/toolkit-content/skills/module-06-competitive-analysis/ — this file is the
// seeded copy, kept in sync by anti-drift.test.ts.
//
// Module 6 has no website Documents step. Founder-supplied material is
// shared directly in chat, transcribed and saved via save_prep_extract,
// then read back via get_module_context / get_prep_document.

const COMPETITIVE_LANDSCAPE_TEMPLATE = `# Competitive Landscape

## Venture
- Venture name:
- Product name / working title:
- Beachhead customer:

## Landscape

| Competitor | URL | Type (direct / indirect / status quo) | Verbatim headline | Primary user (stated) | Strength | Critical gap for our customer | Source |
|---|---|---|---|---|---|---|---|
| | | | | | | | |
| | | | | | | | |
| | | | | | | | |

### Gap statement

### Strongest case against the gap

## Feature comparison

| Capability (customer criteria) | …competitors… | Us | Notes |
|---|---|---|---|
| | | | |
| | | | |
| | | | |

### Matrix verdict

-

## Positioning map

**X-axis:**

**Y-axis:**

| Player | X (0–10) | Y (0–10) | Rationale |
|---|---|---|---|
| | | | |
| Us | | | |

### White space we occupy

-
-
-
-
`;

const DEFENSIBLE_POSITION_TEMPLATE = `# Defensible Position

## Venture
- Venture name:
- Product name / working title:

## Differentiation & moat

### Accepted pillars

#### Pillar 1

**Name:**

**Why it compounds:**

**Why it is hard to copy in 18 months:**

#### Pillar 2

**Name:**

**Why it compounds:**

**Why it is hard to copy in 18 months:**

#### Pillar 3

**Name:**

**Why it compounds:**

**Why it is hard to copy in 18 months:**

### Rejected claims

| Claim | Why it fails as a moat |
|---|---|
| | |

## Why now

| Trigger | Evidence or assumption |
|---|---|
| Market / behaviour trigger | |
| Technology or platform unlock | |
| Evidence customers are looking now | |
| Why incumbents have not filled it / cannot respond fast | |

## Why us

| Advantage | Evidence or assumption |
|---|---|
| Lived problem / domain position | |
| Traction (if any) | |
| Proprietary access (data, relationships, distribution, tech) | |
| Background / network speed or credibility | |

## Closing position statement
`;

const MODULE_6_QUESTIONS: QuestionContent[] = [
  {
    questionKey: "competitor_sources",
    sequenceIndex: 1,
    questionGroup: "landscape",
    questionText:
      "What live URLs and captured notes define the direct, indirect, and status-quo alternatives to research?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "landscape_data",
    sequenceIndex: 2,
    questionGroup: "landscape",
    questionText:
      "For each competitor, what are the verbatim headline, strength, critical gap for the beachhead customer, source, and the agreed market gap statement?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "evaluation_criteria",
    sequenceIndex: 3,
    questionGroup: "comparison",
    questionText:
      "What 5–7 capabilities does the beachhead customer use to evaluate options?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "feature_matrix",
    sequenceIndex: 4,
    questionGroup: "comparison",
    questionText:
      "For each capability, how does each competitor and this venture score (Full / Partial / None), and what is the matrix verdict?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "moat_claim",
    sequenceIndex: 5,
    questionGroup: "moat",
    questionText:
      "What does the Founder believe makes the product hard to copy within 18 months?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "defensible_pillars",
    sequenceIndex: 6,
    questionGroup: "moat",
    questionText:
      "Which moat pillars survive stress-testing, which claims were rejected, and why?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "positioning_map",
    sequenceIndex: 7,
    questionGroup: "moat",
    questionText:
      "What are the two customer-meaningful axes, where does each player sit, and what white space do we occupy?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "why_now",
    sequenceIndex: 8,
    questionGroup: "timing",
    questionText:
      "What triggers make now the right time, each flagged as evidence or assumption?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "why_us",
    sequenceIndex: 9,
    questionGroup: "timing",
    questionText:
      "What structural team advantages apply, each flagged as evidence or assumption?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
];

const COMPETITIVE_LANDSCAPE_ARTIFACT: ArtifactContent = {
  artifactKey: "competitive_landscape",
  sequenceIndex: 1,
  name: "Competitive Landscape",
  description:
    "Landscape table with sourced competitor rows, the gap statement, feature comparison matrix and positioning map.",
  isRequired: true,
  artifactType: "document",
  sourceFormat: "markdown",
  outputFormat: "markdown",
  requiredFilename: "Competitive-Landscape.md",
  rendererKey: null,
  validatorKey: null,
  allowedMimeTypes: ["text/markdown", "text/plain"],
  maxFileSizeBytes: 262_144,
  maxFiles: 1,
  outputConfig: {
    schemaVersion: 1,
    templateFormat: "markdown",
    templateMarkdown: COMPETITIVE_LANDSCAPE_TEMPLATE,
  },
  validationConfig: {},
};

const DEFENSIBLE_POSITION_ARTIFACT: ArtifactContent = {
  artifactKey: "defensible_position",
  sequenceIndex: 2,
  name: "Defensible Position",
  description:
    "Accepted moat pillars with the rejected claims kept visible, plus why now and why us.",
  isRequired: true,
  artifactType: "document",
  sourceFormat: "markdown",
  outputFormat: "markdown",
  requiredFilename: "Defensible-Position.md",
  rendererKey: null,
  validatorKey: null,
  allowedMimeTypes: ["text/markdown", "text/plain"],
  maxFileSizeBytes: 262_144,
  maxFiles: 1,
  outputConfig: {
    schemaVersion: 1,
    templateFormat: "markdown",
    templateMarkdown: DEFENSIBLE_POSITION_TEMPLATE,
  },
  validationConfig: {},
};

export const MODULE_6_CONTENT: ModuleContent = {
  moduleKey: "module-06-competitive-analysis",
  sequenceIndex: 6,
  title: "Competitive analysis",
  subtitle: "Prove you know the market and can win it",
  description:
    "Pressure-tests the competitive landscape against live competitor pages: feature comparison, moat, positioning, why now and why us — every claim flagged evidence or assumption.",
  objective:
    "Establish a defensible competitive position, or an honest account of why one does not exist yet.",
  moduleType: "standard",
  isRequired: true,
  allowRevisions: true,
  completionMode: "artifact_and_confirmation",
  estimatedMinutes: 55,
  isPublishable: true,
  questions: MODULE_6_QUESTIONS,
  artifacts: [COMPETITIVE_LANDSCAPE_ARTIFACT, DEFENSIBLE_POSITION_ARTIFACT],
};
