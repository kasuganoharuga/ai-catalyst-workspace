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
// Founder-supplied material for this module arrives as prep documents
// uploaded on the Work step, read via get_module_context /
// get_prep_document. There is no website intake form.

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

**Why this works for the beachhead (cite evidence or say missing):**

**Conversation still needed (if evidence is thin):**

## Cost structure

| Must spend (now) | Rough amount | BENCHMARKED / ASSUMPTION | Why |
|---|---|---|---|
| | | | |

| Explicitly avoid for now | Why |
|---|---|
| | |

## 90-day week-by-week cash flow

| Week | Outflow | Expected inflow | Source (evidenced / assumed) | Cumulative net | Notes |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| … | | | | | |
| 13 | | | | | |

**Break-even week:**

**Strongest case this projection is wrong:**
-
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
      "What is the shortest concrete path to one paying customer, and which steps require live customer conversation?",
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
      "What is the primary revenue stream to start with, and which two streams can layer later?",
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
    sequenceIndex: 4,
    questionGroup: "model",
    questionText:
      "What packaged offer (price, inclusions, terms, time-bound element) would make the beachhead accept without negotiating?",
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
    sequenceIndex: 5,
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
    sequenceIndex: 6,
    questionGroup: "model",
    questionText:
      "What is the week-by-week 90-day cash flow, and in which week does cumulative net cross positive?",
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
    sequenceIndex: 7,
    questionGroup: "pricing",
    questionText:
      "What exact starting prices apply per stream, with psychology and benchmark or assumption tags?",
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
      "What are the strongest counter-arguments, the evidence that would flip pricing more than 30%, and the 2-week falsifiable experiment?",
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
    "Founder constraints, fastest path to first dollar, revenue streams, the yes-offer, cost structure and the 90-day cash flow.",
  isRequired: true,
  artifactType: "document",
  sourceFormat: "markdown",
  outputFormat: "markdown",
  requiredFilename: "Business-Model.md",
  rendererKey: null,
  validatorKey: null,
  allowedMimeTypes: ["text/markdown", "text/plain"],
  maxFileSizeBytes: 262_144,
  maxFiles: 1,
  outputConfig: {
    schemaVersion: 1,
    templateFormat: "markdown",
    templateMarkdown: BUSINESS_MODEL_TEMPLATE,
  },
  validationConfig: {},
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
  validatorKey: null,
  allowedMimeTypes: ["text/markdown", "text/plain"],
  maxFileSizeBytes: 262_144,
  maxFiles: 1,
  outputConfig: {
    schemaVersion: 1,
    templateFormat: "markdown",
    templateMarkdown: PRICING_STRATEGY_TEMPLATE,
  },
  validationConfig: {},
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
  artifacts: [BUSINESS_MODEL_ARTIFACT, PRICING_STRATEGY_ARTIFACT],
};
