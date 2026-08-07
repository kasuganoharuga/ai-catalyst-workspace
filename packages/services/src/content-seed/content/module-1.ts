import type {
  ArtifactContent,
  ModuleContent,
  QuestionContent,
} from "../types.js";

const PRESSURE_TEST_VERDICT_TEMPLATE = `# Pressure-Test Verdict

## Venture
- Venture name:

## Confirmed Q&A

### 1. Idea in one sentence

### 2. Target customer

### 3. Customer problem

### 4. Business model

### 5. Current stage

### 6. Competitors, alternatives, and doing nothing

## AI Recommendation

**Recommendation:** Proceed / Pivot / Kill

**Reason:**

## Five Failure Reasons

1.
2.
3.
4.
5.

## Competitors / Alternatives

1.
2.
3.

**Evidence note:**

## Success Conditions

## Investor Decision

**Decision:** Yes / No

**Single biggest reason:**

## Recommended Next Step

## Founder's Decision

### Decision
Proceed / Pivot / Kill

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

// AI Recommendation lives only in the Verdict artefact (not a question).
// Founder Decision is the sole structured decision Response; pivot_detail
// is required only when founder_decision = pivot.
const DECISION_QUESTIONS: QuestionContent[] = [
  {
    questionKey: "founder_decision",
    sequenceIndex: 7,
    questionGroup: "founder_decision",
    questionText:
      "Your decision after reviewing the verdict: Proceed, Pivot, or Kill?",
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
    sequenceIndex: 8,
    questionGroup: "founder_decision",
    questionText: "If pivoting, what exactly changes?",
    helpText: "Only required when the Founder decision is Pivot.",
    placeholderText: null,
    responseType: "long_text",
    isRequired: false,
    allowSkip: true,
    options: [],
    conditions: {
      depends_on: "founder_decision",
      operator: "equals",
      value: "pivot",
    },
  },
];

const PRESSURE_TEST_VERDICT_ARTIFACT: ArtifactContent = {
  artifactKey: "pressure_test_verdict",
  sequenceIndex: 1,
  name: "Pressure-Test Verdict",
  description:
    "Locked-schema verdict: AI Recommendation, five failure reasons, competitors/alternatives, success conditions, investor decision, recommended next step, plus the Founder's Proceed/Pivot/Kill decision.",
  isRequired: true,
  artifactType: "document",
  sourceFormat: "markdown",
  outputFormat: "markdown",
  requiredFilename: "Pressure-Test-Verdict.md",
  rendererKey: null,
  validatorKey: "pressure_test_verdict_v2",
  allowedMimeTypes: ["text/markdown", "text/plain"],
  maxFileSizeBytes: 262_144,
  maxFiles: 1,
  outputConfig: {
    schemaVersion: 2,
    templateFormat: "markdown",
    templateMarkdown: PRESSURE_TEST_VERDICT_TEMPLATE,
  },
  validationConfig: {
    schemaVersion: 2,
    validatorKey: "pressure_test_verdict_v2",
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
        key: "ai_recommendation",
        type: "enum",
        allowed: ["proceed", "pivot", "kill"],
      },
      {
        key: "ai_recommendation_reason",
        type: "section_non_empty",
        section: "ai_recommendation_reason",
      },
      {
        key: "recommended_next_step",
        type: "section_non_empty",
        section: "recommended_next_step",
      },
      {
        key: "required_markdown_sections",
        type: "sections_exist",
        sections: [
          "confirmed_qa",
          "ai_recommendation",
          "failure_reasons",
          "competitors_alternatives",
          "success_conditions",
          "investor_decision_section",
          "recommended_next_step",
          "founders_decision",
        ],
      },
    ],
    submissionRules: [
      { key: "founder_decision_present" },
      { key: "pivot_detail_when_pivot" },
    ],
  },
};

export const MODULE_1_CONTENT: ModuleContent = {
  moduleKey: "module-01-pressure-test",
  sequenceIndex: 1,
  title: "Pressure-Test My Idea",
  subtitle:
    "Test whether the current idea is clear and credible enough to continue",
  description:
    "Six confirmed structured answers (batch-saved after summary confirm), a locked-schema Pressure-Test Verdict with AI Recommendation, and a Founder Proceed/Pivot/Kill decision. Completeness unlocks the next module regardless of the decision.",
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
