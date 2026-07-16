import type { ArtifactContent, ModuleContent, QuestionContent } from "../types.js";

const PRESSURE_TEST_VERDICT_TEMPLATE = `# Pressure-Test Verdict

## Venture
- Venture name:
- Run:
- Branch:
- Attempt:
- Completed at:

## Confirmed Q&A

### 1. Idea in one sentence

### 2. Target customer

### 3. Customer problem

### 4. Business model

### 5. Current stage

### 6. Competitors, alternatives, and doing nothing

## Four-Part Verdict

### 1. Five reasons this business may fail

1.
2.
3.
4.
5.

### 2. Existing competitors and alternatives

1.
2.
3.

**Evidence note:**

### 3. Conditions required for success

### 4. Would an investor invest today?

**Decision:** Yes / No

**Single biggest reason:**

## Founder's Decision

### Initial decision

Proceed / Pivot / Kill

### Strongest counter-case

### Final confirmed decision

### Pivot detail, if applicable

## Working Notes / Unresolved Assumptions

- None
`;

const CURRENT_STAGE_OPTIONS = [
  { value: "idea_only", label: "Idea only" },
  { value: "prototype", label: "Prototype" },
  { value: "early_users", label: "Early users" },
  { value: "paying_customers", label: "Paying customers" },
];

const DECISION_OPTIONS = [
  { value: "proceed", label: "Proceed" },
  { value: "pivot", label: "Pivot" },
  { value: "kill", label: "Kill" },
];

const CORE_QUESTIONS: QuestionContent[] = [
  {
    questionKey: "idea_one_sentence",
    sequenceIndex: 1,
    questionGroup: "idea_pressure_test",
    questionText: "What is your idea in one sentence?",
    helpText: null,
    placeholderText: null,
    responseType: "short_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "target_customer",
    sequenceIndex: 2,
    questionGroup: "idea_pressure_test",
    questionText:
      "Who is your target customer? Describe them like a real person, not a segment.",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "customer_problem",
    sequenceIndex: 3,
    questionGroup: "idea_pressure_test",
    questionText: "What problem does this solve for that target customer?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "business_model",
    sequenceIndex: 4,
    questionGroup: "idea_pressure_test",
    questionText: "How does this idea make money?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "current_stage",
    sequenceIndex: 5,
    questionGroup: "idea_pressure_test",
    questionText:
      "What is the idea's current stage — idea only, prototype, early users, or paying customers?",
    helpText: null,
    placeholderText: null,
    responseType: "single_choice",
    isRequired: true,
    allowSkip: false,
    options: CURRENT_STAGE_OPTIONS,
    conditions: {},
  },
  {
    questionKey: "competitors_alternatives",
    sequenceIndex: 6,
    questionGroup: "idea_pressure_test",
    questionText:
      "What alternatives or competitors do customers use today, including doing nothing?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
];

// `pivot_detail` uses `conditions` (not just `allow_skip`) to express
// "only required when final_decision = pivot".
const DECISION_QUESTIONS: QuestionContent[] = [
  {
    questionKey: "initial_decision",
    sequenceIndex: 7,
    questionGroup: "founder_decision",
    questionText: "Initial decision: Proceed, Pivot, or Kill?",
    helpText: null,
    placeholderText: null,
    responseType: "single_choice",
    isRequired: true,
    allowSkip: false,
    options: DECISION_OPTIONS,
    conditions: {},
  },
  {
    questionKey: "final_decision",
    sequenceIndex: 8,
    questionGroup: "founder_decision",
    questionText:
      "Final confirmed decision after reviewing the counter-case: Proceed, Pivot, or Kill?",
    helpText: null,
    placeholderText: null,
    responseType: "single_choice",
    isRequired: true,
    allowSkip: false,
    options: DECISION_OPTIONS,
    conditions: {},
  },
  {
    questionKey: "pivot_detail",
    sequenceIndex: 9,
    questionGroup: "founder_decision",
    questionText: "If pivoting, what exactly changes?",
    helpText: "Only required when the final decision is Pivot.",
    placeholderText: null,
    responseType: "long_text",
    isRequired: false,
    allowSkip: true,
    options: [],
    conditions: { depends_on: "final_decision", operator: "equals", value: "pivot" },
  },
];

// The strongest counter-case is AI-generated content, not a Founder answer —
// it is not modelled as a 10th question. It lives only in the Verdict
// artefact's "Strongest counter-case" section, and `submissionRules` below
// requires that section to be present and non-empty.
const PRESSURE_TEST_VERDICT_ARTIFACT: ArtifactContent = {
  artifactKey: "pressure_test_verdict",
  sequenceIndex: 1,
  name: "Pressure-Test Verdict",
  description:
    "The four-part verdict (failure reasons, competitors/alternatives, success conditions, investor decision) plus the Founder's Proceed/Pivot/Kill decision and the strongest counter-case.",
  isRequired: true,
  artifactType: "document",
  sourceFormat: "markdown",
  outputFormat: "markdown",
  requiredFilename: "Pressure-Test-Verdict.md",
  rendererKey: null,
  validatorKey: "pressure_test_verdict_v1",
  allowedMimeTypes: ["text/markdown", "text/plain"],
  maxFileSizeBytes: 262_144,
  maxFiles: 1,
  outputConfig: {
    schemaVersion: 1,
    templateFormat: "markdown",
    templateMarkdown: PRESSURE_TEST_VERDICT_TEMPLATE,
  },
  // Two layers: `draftRules` are the completeness/structure checks a
  // draft_check can implement without parsing natural language;
  // `submissionRules` cover the Founder decision fields that gate final
  // submission.
  validationConfig: {
    schemaVersion: 1,
    validatorKey: "pressure_test_verdict_v1",
    draftRules: [
      { key: "six_confirmed_responses", type: "response_count", expected: 6 },
      {
        key: "five_failure_reasons",
        type: "list_length",
        section: "failure_reasons",
        expected: 5,
      },
      {
        key: "three_named_alternatives",
        type: "minimum_named_items",
        section: "competitors_alternatives",
        minimum: 3,
      },
      {
        key: "success_conditions_actionable",
        type: "section_non_empty",
        section: "success_conditions",
      },
      { key: "investor_decision", type: "enum", allowed: ["yes", "no"] },
      {
        key: "single_strongest_reason",
        type: "section_non_empty",
        section: "single_biggest_reason",
      },
      {
        key: "unsupported_evidence_labelled",
        type: "section_non_empty",
        section: "evidence_note",
      },
      {
        key: "required_markdown_sections",
        type: "sections_exist",
        sections: ["confirmed_qa", "four_part_verdict", "founders_decision"],
      },
    ],
    submissionRules: [
      { key: "initial_decision_present" },
      { key: "strongest_counter_case_present" },
      { key: "final_decision_present" },
      { key: "pivot_detail_when_pivot" },
    ],
  },
};

export const MODULE_1_CONTENT: ModuleContent = {
  moduleKey: "module-01-pressure-test",
  sequenceIndex: 1,
  title: "Pressure-Test My Idea",
  subtitle: "Test whether the current idea is clear and credible enough to continue",
  description:
    "Six confirmed structured answers, a four-part verdict (failure reasons, competitors/alternatives, success conditions, investor decision), and a Proceed/Pivot/Kill decision with the strongest counter-case recorded.",
  objective:
    "Help the Founder test whether the current idea is clear and credible enough to continue.",
  moduleType: "standard",
  isRequired: true,
  allowRevisions: true,
  completionMode: "artifact_and_confirmation",
  estimatedMinutes: 30,
  isPublishable: true,
  questions: [...CORE_QUESTIONS, ...DECISION_QUESTIONS],
  artifacts: [PRESSURE_TEST_VERDICT_ARTIFACT],
};
