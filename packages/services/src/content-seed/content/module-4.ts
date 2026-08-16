import type {
  ArtifactContent,
  ModuleContent,
  QuestionContent,
} from "../types.js";

// Module 4 — Solution statement, features & benefits.
//
// Replaces Proof (module-04-evidence-of-unmet-need) in the 1-7 sequence:
// Pressure-Test → ICA → Problem → Solution → Epics → Competitive →
// Business model. Canonical source is the reviewed Markdown under
// packages/toolkit-content/skills/module-04-solution-statement/ — this
// file is the seeded copy, kept in sync by anti-drift.test.ts.
//
// Interview material no longer arrives as a structured website form. Module
// 4 has no website Documents step: the Founder shares interview notes
// directly in chat, the facilitator transcribes them and saves the extract
// via save_prep_extract, then reads it back via get_module_context /
// get_prep_document. That is why there is no interview_evidence artifact
// here any more.

const NORTH_STAR_TEMPLATE = `# North Star

## Venture
- Venture name:
- Product name / working title:
- Category:

## Solution statement

-

## Differentiator

### Current

-

### Rejected (strikethrough)

-
`;

const FEATURE_BENEFIT_MAP_TEMPLATE = `# Feature Benefit Map

## Venture
- Venture name:
- Product name / working title:

## Feature brain dump

-
-
-

## Minimum Loveable features (top 3)

| # | Feature | One-line definition |
|---|---|---|
| 1 | | |
| 2 | | |
| 3 | | |

## Benefits

| Feature | Functional benefit | Emotional benefit |
|---|---|---|
| | | |
| | | |
| | | |

## Desirability Order

### Founder ranking

1.
2.
3.

### Facilitator ranking

1.
2.
3.

### Disagreement / reasoning

-

## Assumption Risks

| Feature | Validated or assumed | What to learn | How to learn it |
|---|---|---|---|
| | | | |
| | | | |
| | | | |

### Feature the Founder would cut before launch

-
`;

// Eight fields across three conversation blocks. These question_text
// values are the canonical statement of what each field must establish —
// they are not read aloud; §2 of the prompt set is what the Founder hears.
const SOLUTION_QUESTIONS: QuestionContent[] = [
  {
    questionKey: "product_definition",
    sequenceIndex: 1,
    questionGroup: "north_star",
    questionText:
      "What is the product name or working title, what category is it, and what core outcome does it deliver for the beachhead customer?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "differentiator",
    sequenceIndex: 2,
    questionGroup: "north_star",
    questionText:
      "What structural reason makes this solution different from current alternatives and from doing nothing?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "north_star_statement",
    sequenceIndex: 3,
    questionGroup: "north_star",
    questionText:
      "What is the confirmed one-line North Star solution statement?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "feature_brain_dump",
    sequenceIndex: 4,
    questionGroup: "features",
    questionText:
      "What is every feature under consideration for the first version, unfiltered?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "most_valuable_features",
    sequenceIndex: 5,
    questionGroup: "features",
    questionText:
      "Which three features would still make a matching customer choose this product if they were the only things it did?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "feature_benefits",
    sequenceIndex: 6,
    questionGroup: "features",
    questionText:
      "For each of the three features, what is the functional benefit and the emotional benefit?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "desirability_order",
    sequenceIndex: 7,
    questionGroup: "rank",
    questionText:
      "In what order would the beachhead customer most want the three features delivered, and what evidence supports that order?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "assumption_risks",
    sequenceIndex: 8,
    questionGroup: "rank",
    questionText:
      "Which feature would be cut first, which are validated vs assumed, and what must be learned before building each?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
];

const NORTH_STAR_ARTIFACT: ArtifactContent = {
  artifactKey: "north_star",
  sequenceIndex: 1,
  name: "North Star",
  description:
    "One-line internal solution statement plus the structural differentiator, with rejected claims kept visible.",
  isRequired: true,
  artifactType: "document",
  sourceFormat: "markdown",
  outputFormat: "markdown",
  requiredFilename: "North-Star.md",
  rendererKey: null,
  validatorKey: "structured_markdown_v1",
  allowedMimeTypes: ["text/markdown", "text/plain"],
  maxFileSizeBytes: 262_144,
  maxFiles: 1,
  outputConfig: {
    schemaVersion: 1,
    templateFormat: "markdown",
    templateMarkdown: NORTH_STAR_TEMPLATE,
  },
  validationConfig: {
    schemaVersion: 1,
    draftRules: [
      {
        key: "required_sections",
        type: "sections_exist",
        sections: [
          { level: 2, heading: "Venture" },
          { level: 2, heading: "Solution statement" },
          { level: 2, heading: "Differentiator" },
          { level: 3, heading: "Current" },
          { level: 3, heading: "Rejected (strikethrough)" },
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
        key: "category",
        type: "label_present",
        label: "Category",
        scope: { level: 2, heading: "Venture" },
      },
      {
        key: "solution_statement_present",
        type: "section_non_empty",
        level: 2,
        heading: "Solution statement",
      },
      {
        key: "differentiator_current_present",
        type: "section_non_empty",
        level: 3,
        heading: "Current",
      },
      {
        key: "differentiator_rejected_present",
        type: "section_non_empty",
        level: 3,
        heading: "Rejected (strikethrough)",
      },
    ],
    submissionRules: [],
  },
};

const FEATURE_BENEFIT_MAP_ARTIFACT: ArtifactContent = {
  artifactKey: "feature_benefit_map",
  sequenceIndex: 2,
  name: "Feature Benefit Map",
  description:
    "Brain dump, the three Minimum Loveable features, their functional and emotional benefits, desirability order and assumption risks.",
  isRequired: true,
  artifactType: "document",
  sourceFormat: "markdown",
  outputFormat: "markdown",
  requiredFilename: "Feature-Benefit-Map.md",
  rendererKey: null,
  validatorKey: "structured_markdown_v1",
  allowedMimeTypes: ["text/markdown", "text/plain"],
  maxFileSizeBytes: 262_144,
  maxFiles: 1,
  outputConfig: {
    schemaVersion: 1,
    templateFormat: "markdown",
    templateMarkdown: FEATURE_BENEFIT_MAP_TEMPLATE,
  },
  validationConfig: {
    schemaVersion: 1,
    draftRules: [
      {
        key: "required_sections",
        type: "sections_exist",
        sections: [
          { level: 2, heading: "Venture" },
          { level: 2, heading: "Feature brain dump" },
          { level: 2, heading: "Minimum Loveable features (top 3)" },
          { level: 2, heading: "Benefits" },
          { level: 2, heading: "Desirability Order" },
          { level: 3, heading: "Founder ranking" },
          { level: 3, heading: "Facilitator ranking" },
          { level: 3, heading: "Disagreement / reasoning" },
          { level: 2, heading: "Assumption Risks" },
          { level: 3, heading: "Feature the Founder would cut before launch" },
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
        key: "brain_dump_present",
        type: "section_non_empty",
        level: 2,
        heading: "Feature brain dump",
      },
      {
        key: "mlf_three_rows",
        type: "range_table_rows",
        level: 2,
        heading: "Minimum Loveable features (top 3)",
        minimum: 3,
        maximum: 3,
      },
      {
        key: "mlf_cells",
        type: "table_required_cells",
        level: 2,
        heading: "Minimum Loveable features (top 3)",
        requiredColumns: ["Feature", "One-line definition"],
      },
      {
        key: "benefits_three_rows",
        type: "range_table_rows",
        level: 2,
        heading: "Benefits",
        minimum: 3,
        maximum: 3,
      },
      {
        key: "benefits_cells",
        type: "table_required_cells",
        level: 2,
        heading: "Benefits",
        requiredColumns: ["Feature", "Functional benefit", "Emotional benefit"],
      },
      {
        key: "founder_ranking_three",
        type: "range_named_items",
        level: 3,
        heading: "Founder ranking",
        minimum: 3,
        maximum: 3,
      },
      {
        key: "facilitator_ranking_three",
        type: "range_named_items",
        level: 3,
        heading: "Facilitator ranking",
        minimum: 3,
        maximum: 3,
      },
      {
        key: "disagreement_present",
        type: "section_non_empty",
        level: 3,
        heading: "Disagreement / reasoning",
      },
      {
        key: "assumption_risks_three_rows",
        type: "range_table_rows",
        level: 2,
        heading: "Assumption Risks",
        minimum: 3,
        maximum: 3,
      },
      {
        key: "assumption_risks_cells",
        type: "table_required_cells",
        level: 2,
        heading: "Assumption Risks",
        requiredColumns: [
          "Feature",
          "Validated or assumed",
          "What to learn",
          "How to learn it",
        ],
      },
      {
        key: "cut_feature_present",
        type: "section_non_empty",
        level: 3,
        heading: "Feature the Founder would cut before launch",
      },
    ],
    submissionRules: [],
  },
};

export const MODULE_4_CONTENT: ModuleContent = {
  moduleKey: "module-04-solution-statement",
  sequenceIndex: 4,
  title: "Solution",
  subtitle:
    "Name what you are building, prove why it wins, and pick the three features worth building first",
  description:
    "Turns the locked beachhead and problem, plus whatever interview material the Founder uploaded, into a North Star solution statement and three Minimum Loveable features ranked by customer desirability.",
  objective:
    "Commit to a precise solution statement with a structural differentiator, and prioritise three features by what the customer actually wants.",
  moduleType: "standard",
  isRequired: true,
  allowRevisions: true,
  completionMode: "artifact_and_confirmation",
  estimatedMinutes: 45,
  isPublishable: true,
  questions: SOLUTION_QUESTIONS,
  artifacts: [NORTH_STAR_ARTIFACT, FEATURE_BENEFIT_MAP_ARTIFACT],
};
