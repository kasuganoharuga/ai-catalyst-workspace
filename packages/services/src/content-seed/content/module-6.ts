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

const PILLAR_STATUS_ALLOWED = [
  "Evidence-backed",
  "Emerging / Assumption",
] as const;

function defensiblePillarDraftRules(pillarNumber: 1 | 2 | 3) {
  const scope = { level: 4, heading: `Pillar ${pillarNumber}` };
  const prefix = `pillar_${pillarNumber}`;
  return [
    {
      key: `${prefix}_name`,
      type: "label_present" as const,
      label: "Name",
      scope,
    },
    {
      key: `${prefix}_mechanism`,
      type: "label_present" as const,
      label: "Structural mechanism",
      scope,
    },
    {
      key: `${prefix}_status`,
      type: "label_enum" as const,
      label: "Status",
      allowed: [...PILLAR_STATUS_ALLOWED],
      scope,
    },
    {
      key: `${prefix}_basis`,
      type: "label_present" as const,
      label: "Evidence or assumption basis",
      scope,
    },
    {
      key: `${prefix}_compounds`,
      type: "label_present" as const,
      label: "Why it could compound with usage",
      scope,
    },
    {
      key: `${prefix}_hard_to_copy`,
      type: "label_present" as const,
      label: "Why it could become hard to copy within 18 months",
      scope,
    },
    {
      key: `${prefix}_still_to_prove`,
      type: "label_present" as const,
      label: "What still must be proven or built",
      scope,
    },
  ];
}

const DEFENSIBLE_POSITION_TEMPLATE = `# Defensible Position

## Venture
- Venture name:
- Product name / working title:

## Differentiation & moat

### Defensibility pillars

#### Pillar 1

**Name:**

**Structural mechanism:**

**Status:**

**Evidence or assumption basis:**

**Why it could compound with usage:**

**Why it could become hard to copy within 18 months:**

**What still must be proven or built:**

#### Pillar 2

**Name:**

**Structural mechanism:**

**Status:**

**Evidence or assumption basis:**

**Why it could compound with usage:**

**Why it could become hard to copy within 18 months:**

**What still must be proven or built:**

#### Pillar 3

**Name:**

**Structural mechanism:**

**Status:**

**Evidence or assumption basis:**

**Why it could compound with usage:**

**Why it could become hard to copy within 18 months:**

**What still must be proven or built:**

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
      "What live URLs define the Founder-confirmed direct, indirect, and status-quo alternatives to review?",
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
      "For each competitor, what live-source facts (headline, strength, URL, fetch status) and current gap hypothesis — with the strongest case against it — apply?",
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
      "What 5–7 criteria does the beachhead customer actually use to evaluate and choose among alternatives?",
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
      "For each criterion, what sourced evidence grade applies to each competitor and this venture, and what is the matrix verdict?",
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
      "Which three Founder-confirmed defensibility pillars apply — each with status Evidence-backed or Emerging / Assumption — which claims were rejected, and why?",
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
    questionGroup: "positioning",
    questionText:
      "What two customer-meaningful axes did the Founder propose, where does each player sit as a reasoned estimate, and what white-space hypothesis remains?",
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
      "What structural team advantages apply, each flagged as evidence or assumption — empty traction and no demonstrated proprietary access are valid?",
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
    "Live-source landscape rows, a current gap hypothesis with the strongest case against it, a sourced comparison matrix, and a Founder-led positioning map.",
  isRequired: true,
  artifactType: "document",
  sourceFormat: "markdown",
  outputFormat: "markdown",
  requiredFilename: "Competitive-Landscape.md",
  rendererKey: null,
  validatorKey: "structured_markdown_v1",
  allowedMimeTypes: ["text/markdown", "text/plain"],
  maxFileSizeBytes: 262_144,
  maxFiles: 1,
  outputConfig: {
    schemaVersion: 1,
    templateFormat: "markdown",
    templateMarkdown: COMPETITIVE_LANDSCAPE_TEMPLATE,
  },
  validationConfig: {
    schemaVersion: 1,
    draftRules: [
      {
        key: "required_sections",
        type: "sections_exist",
        sections: [
          { level: 2, heading: "Venture" },
          { level: 2, heading: "Landscape" },
          { level: 3, heading: "Gap statement" },
          { level: 3, heading: "Strongest case against the gap" },
          { level: 2, heading: "Feature comparison" },
          { level: 3, heading: "Matrix verdict" },
          { level: 2, heading: "Positioning map" },
          { level: 3, heading: "White space we occupy" },
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
        key: "beachhead_customer",
        type: "label_present",
        label: "Beachhead customer",
        scope: { level: 2, heading: "Venture" },
      },
      {
        key: "landscape_rows",
        type: "minimum_table_rows",
        level: 2,
        heading: "Landscape",
        minimum: 1,
      },
      {
        key: "landscape_cells",
        type: "table_required_cells",
        level: 2,
        heading: "Landscape",
        requiredColumns: [
          "Competitor",
          "URL",
          "Type (direct / indirect / status quo)",
          "Verbatim headline",
          "Primary user (stated)",
          "Strength",
          "Critical gap for our customer",
          "Source",
        ],
      },
      {
        key: "gap_statement_present",
        type: "section_non_empty",
        level: 3,
        heading: "Gap statement",
      },
      {
        key: "case_against_present",
        type: "section_non_empty",
        level: 3,
        heading: "Strongest case against the gap",
      },
      {
        key: "feature_comparison_rows",
        type: "minimum_table_rows",
        level: 2,
        heading: "Feature comparison",
        minimum: 1,
      },
      {
        key: "feature_comparison_cells",
        type: "table_required_cells",
        level: 2,
        heading: "Feature comparison",
        requiredColumns: ["Capability (customer criteria)", "Us", "Notes"],
      },
      {
        key: "matrix_verdict_present",
        type: "section_non_empty",
        level: 3,
        heading: "Matrix verdict",
      },
      {
        key: "x_axis",
        type: "label_present",
        label: "X-axis",
        scope: { level: 2, heading: "Positioning map" },
      },
      {
        key: "y_axis",
        type: "label_present",
        label: "Y-axis",
        scope: { level: 2, heading: "Positioning map" },
      },
      {
        key: "positioning_cells",
        type: "table_required_cells",
        level: 2,
        heading: "Positioning map",
        requiredColumns: ["Player", "X (0–10)", "Y (0–10)", "Rationale"],
      },
      {
        key: "white_space_present",
        type: "section_non_empty",
        level: 3,
        heading: "White space we occupy",
      },
    ],
    submissionRules: [],
  },
};

const DEFENSIBLE_POSITION_ARTIFACT: ArtifactContent = {
  artifactKey: "defensible_position",
  sequenceIndex: 2,
  name: "Defensible Position",
  description:
    "Exactly three status-labelled defensibility pillars (Evidence-backed or Emerging / Assumption) with rejected claims kept visible, plus Why Now and Why Us.",
  isRequired: true,
  artifactType: "document",
  sourceFormat: "markdown",
  outputFormat: "markdown",
  requiredFilename: "Defensible-Position.md",
  rendererKey: null,
  validatorKey: "structured_markdown_v1",
  allowedMimeTypes: ["text/markdown", "text/plain"],
  maxFileSizeBytes: 262_144,
  maxFiles: 1,
  outputConfig: {
    schemaVersion: 1,
    templateFormat: "markdown",
    templateMarkdown: DEFENSIBLE_POSITION_TEMPLATE,
  },
  validationConfig: {
    schemaVersion: 1,
    draftRules: [
      {
        key: "required_sections",
        type: "sections_exist",
        sections: [
          { level: 2, heading: "Venture" },
          { level: 2, heading: "Differentiation & moat" },
          { level: 3, heading: "Defensibility pillars" },
          { level: 4, heading: "Pillar 1" },
          { level: 4, heading: "Pillar 2" },
          { level: 4, heading: "Pillar 3" },
          { level: 3, heading: "Rejected claims" },
          { level: 2, heading: "Why now" },
          { level: 2, heading: "Why us" },
          { level: 2, heading: "Closing position statement" },
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
      ...defensiblePillarDraftRules(1),
      ...defensiblePillarDraftRules(2),
      ...defensiblePillarDraftRules(3),
      {
        key: "rejected_claims_rows",
        type: "minimum_table_rows",
        level: 3,
        heading: "Rejected claims",
        minimum: 1,
      },
      {
        key: "rejected_claims_cells",
        type: "table_required_cells",
        level: 3,
        heading: "Rejected claims",
        requiredColumns: ["Claim", "Why it fails as a moat"],
      },
      {
        key: "why_now_cells",
        type: "table_required_cells",
        level: 2,
        heading: "Why now",
        requiredColumns: ["Trigger", "Evidence or assumption"],
      },
      {
        key: "why_us_cells",
        type: "table_required_cells",
        level: 2,
        heading: "Why us",
        requiredColumns: ["Advantage", "Evidence or assumption"],
      },
      {
        key: "closing_present",
        type: "section_non_empty",
        level: 2,
        heading: "Closing position statement",
      },
    ],
    submissionRules: [],
  },
};

export const MODULE_6_CONTENT: ModuleContent = {
  moduleKey: "module-06-competitive-analysis",
  sequenceIndex: 6,
  title: "Competitive analysis",
  subtitle: "Prove you know the market and can win it",
  description:
    "Pressure-tests the competitive landscape against live competitor pages: feature comparison, exactly three status-labelled defensibility pillars, positioning, why now and why us — every claim flagged evidence or assumption.",
  objective:
    "Establish exactly three structurally credible defensibility pillars, each labelled Evidence-backed or Emerging / Assumption.",
  moduleType: "standard",
  isRequired: true,
  allowRevisions: true,
  completionMode: "artifact_and_confirmation",
  estimatedMinutes: 55,
  isPublishable: true,
  questions: MODULE_6_QUESTIONS,
  artifacts: [COMPETITIVE_LANDSCAPE_ARTIFACT, DEFENSIBLE_POSITION_ARTIFACT],
};
