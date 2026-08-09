import type {
  ArtifactContent,
  ModuleContent,
  QuestionContent,
} from "../types.js";

// Module 4 — Proof.
// Website Steps 1–2 record interviews and Confirm evidence → Interview-Evidence.md.
// Claude then runs three blocks (Analyse / Decide / Plan) against that pinned
// snapshot. Evidence-Of-Unmet-Need.md and Validation-Roadmap-30-Day.md remain
// the Claude-authored outputs.

const EVIDENCE_OF_UNMET_NEED_TEMPLATE = `# Evidence of Unmet Need

## Venture
- Venture name:

## Evidence Inventory

| Source | Type | What it says | Evidence strength |
|---|---|---|---|
| | | | |
| | | | |
| | | | |

## Evidence Assessment

### Strongest signal

### Weakest gaps

### Highest-leverage information to gather next

## Evidence Maturity Level

**Current level:**

| Level | Meaning |
|---|---|
| 1 — Assumption | You think this might be a problem. |
| 2 — Secondary research | You have read about it in research, articles or reports. |
| 3 — Primary research | You have spoken directly to matching customers about their experience of it. |
| 4 — Demand signal | A matching customer has taken an **unprompted** commercial step toward this venture — requesting a proposal, asking to join a pilot, introducing the budget owner, or attempting to pay. A prompted demo, founder-scheduled call, founder-initiated pilot invitation, or founder-sent landing-page / CTA click is **not** Level 4. |
| 5 — Paying | At least one matching customer has paid this venture — deposit received, paid pilot signed, contract / PO in place, or actual payment cleared — for a solution to this exact problem. A verbal "sounds good, let's start on [date]", a free / unpaid scoped pilot, or a non-binding start date alone is **not** Level 5. |

### Why this level

### What it takes to reach the next level

## Behavioural Evidence Log

| Behaviour | What it proves | Evidence strength |
|---|---|---|
| | | |
| | | |
| | | |

## Falsifiability Test

### Strongest counterargument

### Evidence-backed defence

### Verdict

### What would make it watertight

## Validation Status

This section records the evidence available when this version of the document was created. It is a
current snapshot, not a final validation verdict.

**Current level:** Assumption / Secondary research / Primary research / Demand signal / Paying

### Based on observation

### Founder assumptions

### Important unknowns

### Contradicting evidence

### Highest-priority validation questions
`;

const VALIDATION_ROADMAP_TEMPLATE = `# 30-Day Validation Roadmap

## Venture
- Venture name:

## Constraints

**Time available:**

**Budget:**

**Customer access:**

## What These Experiments Test

## Experiments

| Experiment | Claim tested | Pass condition | Fail condition | Time | Cost | Expected evidence signal | 30-day window |
|---|---|---|---|---|---|---|---|
| | | | | | | | Week 1 |
| | | | | | | | Week 2–3 |
| | | | | | | | Week 3–4 |

### Expected evidence signal

- **Informational** — produces only general information or weak indirect evidence
- **Clarifying** — clarifies an assumption but cannot establish customer behaviour
- **Primary** — can produce direct primary evidence from matching customers
- **Behavioural** — can produce an observable behavioural or commercial demand signal, including founder-prompted outreach (a CTA click after the Founder sends a page is Behavioural, not Evidence Maturity Level 4)
- **Binding** — can produce deposit paid, paid pilot signed, contract / PO, or actual payment (a verbal firm start date alone is not Binding)

## Start Here

**What to do:**

**Who to contact, and how:**

**What counts as a pass:**

**What counts as a fail:**

## 30-Day Decision

**Proceed when:**

**Refine when:**

**Stop or re-scope when:**

## How to Record Results

Results are not recorded in this roadmap. For each experiment, keep:

- the date and who took part;
- the observable result;
- whether the pre-set pass or fail condition was met;
- any contradicting evidence;
- the decision made as a result.

Keep the results with you and bring them into the review that follows. Use the 30-Day Decision
lines above when combining Experiment 1–3 outcomes into Proceed / Refine / Stop.
`;

const INTERVIEW_EVIDENCE_TEMPLATE = `# Customer Interview Evidence

Evidence is recorded on the AI Catalyst website (Module 4 Steps 1–2) and
confirmed by the Founder before Claude starts. Do not invent interviews.
`;

const EVIDENCE_OUTCOME_OPTIONS = [
  { value: "supports", label: "Supports hypothesis" },
  { value: "mixed", label: "Mixed evidence" },
  { value: "contradicts", label: "Contradicts hypothesis" },
];

// Three Claude blocks after website Confirm evidence. Structured interview
// capture lives on the website; these fields are reasoning only.
const EVIDENCE_QUESTIONS: QuestionContent[] = [
  {
    questionKey: "evidence_outcome",
    sequenceIndex: 1,
    questionGroup: "analyse",
    questionText:
      "Taken together, do the confirmed customer interviews support, mix, or contradict the current problem hypothesis?",
    helpText: null,
    placeholderText: null,
    responseType: "single_choice",
    isRequired: true,
    allowSkip: false,
    options: EVIDENCE_OUTCOME_OPTIONS,
    conditions: {},
  },
  {
    questionKey: "evidence_analysis",
    sequenceIndex: 2,
    questionGroup: "analyse",
    questionText:
      "What did you learn — repeated problems, common workarounds, urgency signals, contradictions, unexpected findings, buying signals, and weak evidence?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "evidence_decision",
    sequenceIndex: 3,
    questionGroup: "decide",
    questionText:
      "What should change next — keep or refine the ICA, change the problem, change interview assumptions, or gather more evidence?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "validation_constraints",
    sequenceIndex: 4,
    questionGroup: "plan",
    questionText:
      "Over the next 30 days, what time, budget and customer access is genuinely available?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
];

const EVIDENCE_OF_UNMET_NEED_ARTIFACT: ArtifactContent = {
  artifactKey: "evidence_of_unmet_need",
  sequenceIndex: 2,
  name: "Evidence of Unmet Need",
  description:
    "Evidence inventory assembled from upstream modules plus Module 3's interview notes, evidence maturity level, behavioural evidence log, falsifiability test, and an internal Validation Status. Never capped by an earlier module's historical status.",
  isRequired: true,
  artifactType: "document",
  sourceFormat: "markdown",
  outputFormat: "markdown",
  requiredFilename: "Evidence-Of-Unmet-Need.md",
  rendererKey: "evidence_of_unmet_need_html_v1",
  validatorKey: "structured_markdown_v1",
  allowedMimeTypes: ["text/markdown", "text/plain"],
  maxFileSizeBytes: 262_144,
  maxFiles: 1,
  outputConfig: {
    schemaVersion: 1,
    templateFormat: "markdown",
    templateMarkdown: EVIDENCE_OF_UNMET_NEED_TEMPLATE,
  },
  validationConfig: {
    schemaVersion: 1,
    draftRules: [
      {
        key: "required_sections",
        type: "sections_exist",
        sections: [
          { level: 2, heading: "Venture" },
          { level: 2, heading: "Evidence Inventory" },
          { level: 2, heading: "Evidence Assessment" },
          { level: 2, heading: "Evidence Maturity Level" },
          { level: 2, heading: "Behavioural Evidence Log" },
          { level: 2, heading: "Falsifiability Test" },
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
        key: "inventory_row_count",
        type: "minimum_table_rows",
        level: 2,
        heading: "Evidence Inventory",
        minimum: 1,
        orRecordedUnknown: true,
      },
      {
        key: "inventory_required_cells",
        type: "table_required_cells",
        level: 2,
        heading: "Evidence Inventory",
        requiredColumns: [
          "Source",
          "Type",
          "What it says",
          "Evidence strength",
        ],
      },
      {
        key: "inventory_type_enum",
        type: "table_column_enum",
        level: 2,
        heading: "Evidence Inventory",
        column: "Type",
        allowed: ["data", "conversation", "observation", "signal"],
      },
      {
        key: "inventory_strength_labeled",
        type: "table_column_labeled_reasoning",
        level: 2,
        heading: "Evidence Inventory",
        column: "Evidence strength",
        allowed: ["Weak", "Moderate", "Strong"],
      },
      {
        key: "behavioural_row_count",
        type: "minimum_table_rows",
        level: 2,
        heading: "Behavioural Evidence Log",
        minimum: 1,
        orRecordedUnknown: true,
      },
      {
        key: "behavioural_required_cells",
        type: "table_required_cells",
        level: 2,
        heading: "Behavioural Evidence Log",
        requiredColumns: ["Behaviour", "What it proves", "Evidence strength"],
      },
      {
        key: "behavioural_strength_labeled",
        type: "table_column_labeled_reasoning",
        level: 2,
        heading: "Behavioural Evidence Log",
        column: "Evidence strength",
        allowed: ["Weak", "Moderate", "Strong"],
      },
      {
        key: "strongest_signal_present",
        type: "section_non_empty",
        level: 3,
        heading: "Strongest signal",
      },
      {
        key: "weakest_gaps_present",
        type: "section_non_empty",
        level: 3,
        heading: "Weakest gaps",
      },
      {
        key: "highest_leverage_present",
        type: "section_non_empty",
        level: 3,
        heading: "Highest-leverage information to gather next",
      },
      {
        key: "why_this_level_present",
        type: "section_non_empty",
        level: 3,
        heading: "Why this level",
      },
      {
        key: "next_level_present",
        type: "section_non_empty",
        level: 3,
        heading: "What it takes to reach the next level",
      },
      {
        key: "strongest_counterargument_present",
        type: "section_non_empty",
        level: 3,
        heading: "Strongest counterargument",
      },
      {
        key: "evidence_backed_defence_present",
        type: "section_non_empty",
        level: 3,
        heading: "Evidence-backed defence",
      },
      {
        key: "falsifiability_verdict_present",
        type: "section_non_empty",
        level: 3,
        heading: "Verdict",
      },
      {
        key: "watertight_present",
        type: "section_non_empty",
        level: 3,
        heading: "What would make it watertight",
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
        key: "maturity_level_enum",
        type: "label_enum",
        label: "Current level",
        scope: { level: 2, heading: "Evidence Maturity Level" },
        allowed: [
          "assumption",
          "secondary_research",
          "primary_research",
          "demand_signal",
          "paying",
        ],
      },
      {
        key: "maturity_scaffolding_row_count",
        type: "range_table_rows",
        level: 2,
        heading: "Evidence Maturity Level",
        minimum: 5,
        maximum: 5,
      },
      {
        key: "maturity_scaffolding_sequence",
        type: "table_column_exact_sequence",
        level: 2,
        heading: "Evidence Maturity Level",
        column: "Level",
        values: [
          "1 — Assumption",
          "2 — Secondary research",
          "3 — Primary research",
          "4 — Demand signal",
          "5 — Paying",
        ],
      },
    ],
    submissionRules: [
      {
        key: "maturity_and_validation_status_agree",
        type: "labels_agree",
        labelA: {
          label: "Current level",
          scope: { level: 2, heading: "Evidence Maturity Level" },
        },
        labelB: {
          label: "Current level",
          scope: { level: 2, heading: "Validation Status" },
        },
      },
    ],
  },
};

const VALIDATION_ROADMAP_ARTIFACT: ArtifactContent = {
  artifactKey: "validation_roadmap_30_day",
  sequenceIndex: 3,
  name: "30-Day Validation Roadmap",
  description:
    "Two or three experiments that fit the Founder's real time, budget and access constraints, each with a pre-set pass condition, fail condition and expected evidence signal. Start Here expands the first experiment; 30-Day Decision sets Proceed / Refine / Stop before results arrive.",
  isRequired: true,
  artifactType: "document",
  sourceFormat: "markdown",
  outputFormat: "markdown",
  requiredFilename: "Validation-Roadmap-30-Day.md",
  rendererKey: "validation_roadmap_html_v1",
  validatorKey: "structured_markdown_v1",
  allowedMimeTypes: ["text/markdown", "text/plain"],
  maxFileSizeBytes: 262_144,
  maxFiles: 1,
  outputConfig: {
    schemaVersion: 1,
    templateFormat: "markdown",
    templateMarkdown: VALIDATION_ROADMAP_TEMPLATE,
  },
  validationConfig: {
    schemaVersion: 1,
    draftRules: [
      {
        key: "required_sections",
        type: "sections_exist",
        sections: [
          { level: 2, heading: "Venture" },
          { level: 2, heading: "Constraints" },
          { level: 2, heading: "What These Experiments Test" },
          { level: 2, heading: "Experiments" },
          { level: 3, heading: "Expected evidence signal" },
          { level: 2, heading: "Start Here" },
          { level: 2, heading: "30-Day Decision" },
          { level: 2, heading: "How to Record Results" },
        ],
      },
      {
        key: "venture_name",
        type: "label_present",
        label: "Venture name",
        scope: { level: 2, heading: "Venture" },
      },
      {
        key: "time_available",
        type: "label_present",
        label: "Time available",
        scope: { level: 2, heading: "Constraints" },
      },
      {
        key: "budget",
        type: "label_present",
        label: "Budget",
        scope: { level: 2, heading: "Constraints" },
      },
      {
        key: "customer_access",
        type: "label_present",
        label: "Customer access",
        scope: { level: 2, heading: "Constraints" },
      },
      {
        key: "experiments_test_present",
        type: "section_non_empty",
        level: 2,
        heading: "What These Experiments Test",
      },
      {
        key: "experiment_count",
        type: "range_table_rows",
        level: 2,
        heading: "Experiments",
        minimum: 2,
        maximum: 3,
      },
      {
        key: "experiment_required_cells",
        type: "table_required_cells",
        level: 2,
        heading: "Experiments",
        requiredColumns: [
          "Experiment",
          "Claim tested",
          "Pass condition",
          "Fail condition",
          "Time",
          "Cost",
          "Expected evidence signal",
          "30-day window",
        ],
      },
      {
        key: "experiment_signal_enum",
        type: "table_column_enum",
        level: 2,
        heading: "Experiments",
        column: "Expected evidence signal",
        allowed: [
          "Informational",
          "Clarifying",
          "Primary",
          "Behavioural",
          "Binding",
        ],
      },
      {
        key: "signal_strength_anchors",
        type: "range_named_items",
        level: 3,
        heading: "Expected evidence signal",
        minimum: 5,
        maximum: 5,
      },
      {
        key: "start_here_what_to_do",
        type: "label_present",
        label: "What to do",
        scope: { level: 2, heading: "Start Here" },
      },
      {
        key: "start_here_who_to_contact",
        type: "label_present",
        label: "Who to contact, and how",
        scope: { level: 2, heading: "Start Here" },
      },
      {
        key: "start_here_pass",
        type: "label_present",
        label: "What counts as a pass",
        scope: { level: 2, heading: "Start Here" },
      },
      {
        key: "start_here_fail",
        type: "label_present",
        label: "What counts as a fail",
        scope: { level: 2, heading: "Start Here" },
      },
      {
        key: "decision_proceed",
        type: "label_present",
        label: "Proceed when",
        scope: { level: 2, heading: "30-Day Decision" },
      },
      {
        key: "decision_refine",
        type: "label_present",
        label: "Refine when",
        scope: { level: 2, heading: "30-Day Decision" },
      },
      {
        key: "decision_stop",
        type: "label_present",
        label: "Stop or re-scope when",
        scope: { level: 2, heading: "30-Day Decision" },
      },
      {
        key: "how_to_record_results_present",
        type: "section_non_empty",
        level: 2,
        heading: "How to Record Results",
      },
    ],
    submissionRules: [
      {
        key: "start_here_matches_first_experiment",
        type: "labels_match_first_table_row",
        table: { level: 2, heading: "Experiments" },
        mappings: [
          {
            label: "What counts as a pass",
            scope: { level: 2, heading: "Start Here" },
            column: "Pass condition",
          },
          {
            label: "What counts as a fail",
            scope: { level: 2, heading: "Start Here" },
            column: "Fail condition",
          },
        ],
      },
    ],
  },
};

// Website-confirmed source/input for Module 4 — not a Claude output.
// Materialised and pinned on the attempt when Continue in Claude starts.
// isRequired is false so it does not enter official output validators
// (validatorKey is intentionally null). Presence is enforced by
// completeModuleAttempt's pinned-source prerequisite check instead.
const INTERVIEW_EVIDENCE_ARTIFACT: ArtifactContent = {
  artifactKey: "interview_evidence",
  sequenceIndex: 1,
  name: "Customer Interview Evidence",
  description:
    "Founder-confirmed record of real customer interviews, captured on the website before Claude analyses evidence.",
  isRequired: false,
  artifactType: "document",
  sourceFormat: "markdown",
  outputFormat: "markdown",
  requiredFilename: "Interview-Evidence.md",
  rendererKey: null,
  validatorKey: null,
  allowedMimeTypes: ["text/markdown", "text/plain"],
  maxFileSizeBytes: 262_144,
  maxFiles: 1,
  outputConfig: {
    schemaVersion: 1,
    templateFormat: "markdown",
    templateMarkdown: INTERVIEW_EVIDENCE_TEMPLATE,
  },
  validationConfig: {},
};

export const MODULE_4_CONTENT: ModuleContent = {
  moduleKey: "module-04-evidence-of-unmet-need",
  sequenceIndex: 4,
  title: "Proof",
  subtitle:
    "Record real interviews, confirm the evidence, then analyse and plan the next 30 days",
  description:
    "Website steps capture interview records and lock Interview-Evidence.md. Claude then analyses what was learned, decides what changes, and builds a 30-Day Validation Roadmap.",
  objective:
    "Capture what customers said, analyse the evidence honestly, decide what changes, and plan the next 30 days of validation.",
  moduleType: "standard",
  isRequired: true,
  allowRevisions: true,
  completionMode: "artifact_and_confirmation",
  estimatedMinutes: 50,
  isPublishable: true,
  questions: EVIDENCE_QUESTIONS,
  artifacts: [
    INTERVIEW_EVIDENCE_ARTIFACT,
    EVIDENCE_OF_UNMET_NEED_ARTIFACT,
    VALIDATION_ROADMAP_ARTIFACT,
  ],
};
