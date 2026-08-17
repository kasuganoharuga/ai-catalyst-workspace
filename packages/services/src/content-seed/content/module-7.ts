import type {
  ArtifactContent,
  ModuleContent,
  QuestionContent,
} from "../types.js";

// Module 7 — Business model.
//
// Canonical source is the reviewed Markdown under
// packages/toolkit-content/skills/module-07-business-model/ — this file is the
// seeded copy, kept in sync by anti-drift.test.ts.
//
// Module 7 has no website Documents step. Founder-supplied material is
// shared directly in chat, transcribed and saved via save_prep_extract,
// then read back via get_module_context / get_prep_document.

const BUSINESS_MODEL_TEMPLATE = `# Business Model

## Venture
- Venture name:
- Product name / working title:
- Beachhead customer:

## Inputs

**Starting budget:**

**Available time per week:**

**Month-1 goal:**

- Measurable: yes / no — …

**Month-6 goal:**

- Measurable: yes / no — …

## Fastest path to first dollar

1.
2.
3.

### Steps that require talking to customers (cannot skip)

-

### Prospects-to-paid-pilots funnel

| Stage | Quantity | Conversion assumption | What would change it |
|---|---|---|---|
| Prospects | | | |
| Conversations / replies | | | |
| Qualified calls | | | |
| Paid pilots | | | |

### Reasoning and risks

-

## Revenue streams

| Priority | Stream | Who pays | Unit of value | Rough timing |
|---|---|---|---|---|
| Primary (start) | | | | |
| Layer 2 | | | | |
| Layer 3 | | | | |

### Why this primary stream first

-

## The offer that makes them say yes

**Price / packaging / terms / time-bound element:**

**Operational capacity boundary:**

**Why this works for the beachhead (cite evidence or say missing):**

**Conversation still needed (if evidence is thin):**

## Cost structure

| Must spend (now) | Rough amount | BENCHMARKED / ASSUMPTION | Why |
|---|---|---|---|
| | | | |

| Explicitly avoid for now | Why |
|---|---|
| | |
`;

const PRICING_STRATEGY_TEMPLATE = `# Pricing Strategy

## Venture
- Venture name:
- Product name / working title:
- Beachhead customer:

## Price points

| Stream | Starting price | Inclusions / terms | Psychology (why this number, not ±20%) | Behavioural anchor | BENCHMARKED source or ASSUMPTION |
|---|---|---|---|---|---|
| Primary | | | | | |
| Layer 2 | | | | | |
| Layer 3 | | | | | |

### Reasoning before the numbers

-

### Strongest case against these prices

-

## Pricing pressure-test

### Counter-arguments

1.
2.
3.

### Evidence that would change the recommendation by more than 30%

-

### 2-week falsifiable experiment

**Hypothesis:**

**What we do:**

**What would falsify it:**

**Failure type (whole-offer / price-specific):**
-
`;

const CASH_FLOW_TEMPLATE = `# 90-Day Cash Flow

## Venture
- Venture name:
- Product name / working title:
- Beachhead customer:

## Projection assumptions

-

## 90-day week-by-week cash flow

| Week | Outflow | Expected Inflow | Inflow Basis | Weekly Net | Cumulative Net Cash | Notes |
|---|---|---|---|---|---|---|
| 1 | | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |
| 4 | | | | | | |
| 5 | | | | | | |
| 6 | | | | | | |
| 7 | | | | | | |
| 8 | | | | | | |
| 9 | | | | | | |
| 10 | | | | | | |
| 11 | | | | | | |
| 12 | | | | | | |
| 13 | | | | | | |

**Break-even week:**

## Month-1 / Month-6 goal cross-check

**Month-1:**

**Month-6:**

## Downside case

-

## Key assumptions

**Strongest case this projection is wrong:**
-
`;

const MODULE_7_QUESTIONS: QuestionContent[] = [
  {
    questionKey: "model_inputs",
    sequenceIndex: 1,
    questionGroup: "inputs",
    questionText:
      "What is the starting budget, weekly time available, and measurable month-1 and month-6 goals?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "path_to_first_dollar",
    sequenceIndex: 2,
    questionGroup: "model",
    questionText:
      "What is the recommended shortest concrete path to one paying customer, which steps require live customer conversation, and what prospects-to-paid-pilots funnel assumptions apply — keeping free-prototype tests distinct from paid pilots?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "revenue_streams",
    sequenceIndex: 3,
    questionGroup: "model",
    questionText:
      "What is the recommended primary revenue stream to start now, and which two streams should layer later?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "pricing_strategy",
    sequenceIndex: 4,
    questionGroup: "model",
    questionText:
      "What recommended exact starting prices apply per near-term stream, with psychology and benchmark or assumption tags — a venture price informed by a competitor benchmark stays ASSUMPTION until buying evidence supports it — and which future streams are Not yet priceable?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "yes_offer",
    sequenceIndex: 5,
    questionGroup: "model",
    questionText:
      "What packaged offer (price, inclusions, terms, time-bound element, operational capacity boundary) is the smallest credible paid yes, and what evidence or remaining conversation supports it?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "cost_structure",
    sequenceIndex: 6,
    questionGroup: "model",
    questionText:
      "What must be spent now, at rough amounts, and what should be avoided for now?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "cash_flow_90d",
    sequenceIndex: 7,
    questionGroup: "model",
    questionText:
      "What is the week-by-week 90-day cash flow, the actual break-even week or No break-even within 90 days, and does the base case support the Month-1 and Month-6 goals — without converting a free-prototype test into evidenced inflow?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "pricing_pressure_test",
    sequenceIndex: 8,
    questionGroup: "pricing",
    questionText:
      "What are the strongest counter-arguments, the evidence that would flip pricing more than 30%, and the 2-week falsifiable experiment — distinguishing whole-offer failure from price-specific failure?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
];

const BUSINESS_MODEL_ARTIFACT: ArtifactContent = {
  artifactKey: "business_model",
  sequenceIndex: 1,
  name: "Business Model",
  description:
    "Founder constraints, fastest path to first dollar, prospects-to-paid-pilots funnel, revenue streams, the yes-offer with capacity boundary, and cost structure.",
  isRequired: true,
  artifactType: "document",
  sourceFormat: "markdown",
  outputFormat: "markdown",
  requiredFilename: "Business-Model.md",
  rendererKey: null,
  validatorKey: "structured_markdown_v1",
  allowedMimeTypes: ["text/markdown", "text/plain"],
  maxFileSizeBytes: 262_144,
  maxFiles: 1,
  outputConfig: {
    schemaVersion: 1,
    templateFormat: "markdown",
    templateMarkdown: BUSINESS_MODEL_TEMPLATE,
  },
  validationConfig: {
    schemaVersion: 1,
    draftRules: [
      {
        key: "required_sections",
        type: "sections_exist",
        sections: [
          { level: 2, heading: "Venture" },
          { level: 2, heading: "Inputs" },
          { level: 2, heading: "Fastest path to first dollar" },
          {
            level: 3,
            heading: "Steps that require talking to customers (cannot skip)",
          },
          { level: 3, heading: "Prospects-to-paid-pilots funnel" },
          { level: 3, heading: "Reasoning and risks" },
          { level: 2, heading: "Revenue streams" },
          { level: 3, heading: "Why this primary stream first" },
          { level: 2, heading: "The offer that makes them say yes" },
          { level: 2, heading: "Cost structure" },
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
        key: "starting_budget",
        type: "label_present",
        label: "Starting budget",
        scope: { level: 2, heading: "Inputs" },
      },
      {
        key: "available_time",
        type: "label_present",
        label: "Available time per week",
        scope: { level: 2, heading: "Inputs" },
      },
      {
        key: "path_steps",
        type: "minimum_named_items",
        level: 2,
        heading: "Fastest path to first dollar",
        minimum: 1,
      },
      {
        key: "conversation_steps",
        type: "minimum_named_items",
        level: 3,
        heading: "Steps that require talking to customers (cannot skip)",
        minimum: 1,
      },
      {
        key: "revenue_stream_rows",
        type: "minimum_table_rows",
        level: 2,
        heading: "Revenue streams",
        minimum: 3,
      },
      {
        key: "revenue_stream_cells",
        type: "table_required_cells",
        level: 2,
        heading: "Revenue streams",
        requiredColumns: [
          "Priority",
          "Stream",
          "Who pays",
          "Unit of value",
          "Rough timing",
        ],
      },
      {
        key: "offer_price",
        type: "label_present",
        label: "Price / packaging / terms / time-bound element",
        scope: { level: 2, heading: "The offer that makes them say yes" },
      },
      {
        key: "operational_capacity",
        type: "label_present",
        label: "Operational capacity boundary",
        scope: { level: 2, heading: "The offer that makes them say yes" },
      },
      {
        key: "funnel_rows",
        type: "minimum_table_rows",
        level: 3,
        heading: "Prospects-to-paid-pilots funnel",
        minimum: 4,
      },
      {
        key: "funnel_cells",
        type: "table_required_cells",
        level: 3,
        heading: "Prospects-to-paid-pilots funnel",
        requiredColumns: [
          "Stage",
          "Quantity",
          "Conversion assumption",
          "What would change it",
        ],
      },
      {
        key: "must_spend_rows",
        type: "minimum_table_rows",
        level: 2,
        heading: "Cost structure",
        minimum: 1,
      },
      {
        key: "must_spend_cells",
        type: "table_required_cells",
        level: 2,
        heading: "Cost structure",
        requiredColumns: [
          "Must spend (now)",
          "Rough amount",
          "BENCHMARKED / ASSUMPTION",
          "Why",
        ],
      },
    ],
    submissionRules: [],
  },
};

const PRICING_STRATEGY_ARTIFACT: ArtifactContent = {
  artifactKey: "pricing_strategy",
  sequenceIndex: 2,
  name: "Pricing Strategy",
  description:
    "Exact starting prices with their psychology and sources, plus the pricing pressure-test.",
  isRequired: true,
  artifactType: "document",
  sourceFormat: "markdown",
  outputFormat: "markdown",
  requiredFilename: "Pricing-Strategy.md",
  rendererKey: null,
  validatorKey: "structured_markdown_v1",
  allowedMimeTypes: ["text/markdown", "text/plain"],
  maxFileSizeBytes: 262_144,
  maxFiles: 1,
  outputConfig: {
    schemaVersion: 1,
    templateFormat: "markdown",
    templateMarkdown: PRICING_STRATEGY_TEMPLATE,
  },
  validationConfig: {
    schemaVersion: 1,
    draftRules: [
      {
        key: "required_sections",
        type: "sections_exist",
        sections: [
          { level: 2, heading: "Venture" },
          { level: 2, heading: "Price points" },
          { level: 3, heading: "Reasoning before the numbers" },
          { level: 3, heading: "Strongest case against these prices" },
          { level: 2, heading: "Pricing pressure-test" },
          { level: 3, heading: "Counter-arguments" },
          {
            level: 3,
            heading:
              "Evidence that would change the recommendation by more than 30%",
          },
          { level: 3, heading: "2-week falsifiable experiment" },
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
        key: "price_point_rows",
        type: "minimum_table_rows",
        level: 2,
        heading: "Price points",
        minimum: 3,
      },
      {
        key: "price_point_cells",
        type: "table_required_cells",
        level: 2,
        heading: "Price points",
        requiredColumns: [
          "Stream",
          "Starting price",
          "Inclusions / terms",
          "Psychology (why this number, not ±20%)",
          "Behavioural anchor",
          "BENCHMARKED source or ASSUMPTION",
        ],
      },
      {
        key: "counter_arguments",
        type: "minimum_named_items",
        level: 3,
        heading: "Counter-arguments",
        minimum: 3,
      },
      {
        key: "flip_evidence",
        type: "section_non_empty",
        level: 3,
        heading:
          "Evidence that would change the recommendation by more than 30%",
      },
      {
        key: "experiment_hypothesis",
        type: "label_present",
        label: "Hypothesis",
        scope: { level: 3, heading: "2-week falsifiable experiment" },
      },
      {
        key: "failure_type",
        type: "label_present",
        label: "Failure type (whole-offer / price-specific)",
        scope: { level: 3, heading: "2-week falsifiable experiment" },
      },
    ],
    submissionRules: [],
  },
};

const CASH_FLOW_ARTIFACT: ArtifactContent = {
  artifactKey: "cash_flow_90d",
  sequenceIndex: 3,
  name: "90-Day Cash Flow",
  description:
    "Assumptions, 13-week cash-flow projection, break-even, Month-1/Month-6 goal cross-check, and downside case.",
  isRequired: true,
  artifactType: "document",
  sourceFormat: "markdown",
  outputFormat: "markdown",
  requiredFilename: "90-Day-Cash-Flow.md",
  rendererKey: null,
  validatorKey: "structured_markdown_v1",
  allowedMimeTypes: ["text/markdown", "text/plain"],
  maxFileSizeBytes: 262_144,
  maxFiles: 1,
  outputConfig: {
    schemaVersion: 1,
    templateFormat: "markdown",
    templateMarkdown: CASH_FLOW_TEMPLATE,
  },
  validationConfig: {
    schemaVersion: 1,
    draftRules: [
      {
        key: "required_sections",
        type: "sections_exist",
        sections: [
          { level: 2, heading: "Venture" },
          { level: 2, heading: "Projection assumptions" },
          { level: 2, heading: "90-day week-by-week cash flow" },
          { level: 2, heading: "Month-1 / Month-6 goal cross-check" },
          { level: 2, heading: "Downside case" },
          { level: 2, heading: "Key assumptions" },
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
        key: "cash_flow_rows",
        type: "minimum_table_rows",
        level: 2,
        heading: "90-day week-by-week cash flow",
        minimum: 13,
      },
      {
        key: "cash_flow_cells",
        type: "table_required_cells",
        level: 2,
        heading: "90-day week-by-week cash flow",
        requiredColumns: [
          "Week",
          "Outflow",
          "Expected Inflow",
          "Inflow Basis",
          "Weekly Net",
          "Cumulative Net Cash",
        ],
      },
      {
        key: "break_even",
        type: "label_present",
        label: "Break-even week",
        scope: { level: 2, heading: "90-day week-by-week cash flow" },
      },
      {
        key: "month_1_goal",
        type: "label_present",
        label: "Month-1",
        scope: { level: 2, heading: "Month-1 / Month-6 goal cross-check" },
      },
      {
        key: "month_6_goal",
        type: "label_present",
        label: "Month-6",
        scope: { level: 2, heading: "Month-1 / Month-6 goal cross-check" },
      },
      {
        key: "downside_case",
        type: "section_non_empty",
        level: 2,
        heading: "Downside case",
      },
    ],
    submissionRules: [],
  },
};

export const MODULE_7_CONTENT: ModuleContent = {
  moduleKey: "module-07-business-model",
  sequenceIndex: 7,
  title: "Business model",
  subtitle:
    "Turn the locked customer and solution into a concrete path to revenue",
  description:
    "Builds the path to first dollar, revenue streams, the offer that earns a yes, cost discipline, a 90-day cash-flow projection and exact prices — every number tagged benchmarked or assumption.",
  objective:
    "Produce a money path specific enough to act on, with pricing that survives its own pressure-test.",
  moduleType: "standard",
  isRequired: true,
  allowRevisions: true,
  completionMode: "artifact_and_confirmation",
  estimatedMinutes: 55,
  isPublishable: true,
  questions: MODULE_7_QUESTIONS,
  artifacts: [
    BUSINESS_MODEL_ARTIFACT,
    PRICING_STRATEGY_ARTIFACT,
    CASH_FLOW_ARTIFACT,
  ],
};
