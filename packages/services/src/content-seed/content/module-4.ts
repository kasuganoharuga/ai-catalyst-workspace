import type {
  ArtifactContent,
  ModuleContent,
  QuestionContent,
} from "../types.js";

// Ported from skills/module-04-evidence-of-unmet-need/prompts/module-04-prompt-set.md
// (§1 field ownership, §3 question rows, §5 artifact generator) and the
// templates it names. Three artefacts, in the order they happen:
// Interview-Notes.md is the ungraded record of Module 3's interviews, saved
// first and re-read from storage as this module's source of truth for what
// the customers said (see INTERVIEW_NOTES_ARTIFACT); Evidence-Of-Unmet-Need.md
// then grades what is actually known; Validation-Roadmap-30-Day.md plans the
// next 30 days. Upstream Module 2/3 validation statuses are historical
// snapshots, never a ceiling on the level this module may assign.

const EVIDENCE_OF_UNMET_NEED_TEMPLATE = `# Evidence of Unmet Need

## Venture
- Venture name:

## Evidence Inventory

| Source | Type | What it says | Evidence strength (1–5) |
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
| 4 — Demand signal | A matching customer has taken an unprompted commercial step toward this venture — requesting a proposal, asking to join a pilot, introducing the budget owner, attempting to pay, or asking for a specific availability date. |
| 5 — Paying | At least one matching customer has paid this venture, signed a paid pilot, or made another binding commercial commitment for a solution to this exact problem. |

### Why this level

### What it takes to reach the next level

## Behavioural Evidence Log

| Behaviour | What it proves | Evidence strength (1–5) |
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

| Experiment | Claim tested | Pass condition | Fail condition | Time | Cost | Expected evidence signal strength (1–5) | 30-day window |
|---|---|---|---|---|---|---|---|
| | | | | | | | Week 1 |
| | | | | | | | Week 2–3 |
| | | | | | | | Week 3–4 |

### Expected evidence signal strength

- **1** — produces only general information or weak indirect evidence
- **2** — clarifies an assumption but cannot establish customer behaviour
- **3** — can produce direct primary evidence from matching customers
- **4** — can produce an observable behavioural or commercial demand signal
- **5** — can produce a binding commercial commitment or payment

## Start Here

**What to do:**

**Who to contact, and how:**

**What counts as a pass:**

**What counts as a fail:**

## How to Record Results

Results are not recorded in this roadmap. For each experiment, keep:

- the date and who took part;
- the observable result;
- whether the pre-set pass or fail condition was met;
- any contradicting evidence;
- the decision made as a result.

Keep the results with you and bring them into the review that follows.
`;

const INTERVIEW_NOTES_TEMPLATE = `# Interview Notes

## Venture
- Venture name:

## Interviews

### Interview 1

**Who they are:**

**When it happened:**

**How it happened:**

**What they said about the problem:**

**What they have already done about it:**

**Direct quotes:**

**What this changes:**

## Signals Outside The Interviews

## Still Unknown
`;

const EVIDENCE_LEVEL_OPTIONS = [
  { value: "assumption", label: "Assumption" },
  { value: "secondary_research", label: "Secondary research" },
  { value: "primary_research", label: "Primary research" },
  { value: "demand_signal", label: "Demand signal" },
  { value: "paying", label: "Paying" },
];

// One question per confirmed field. `evidence_additions` is where Module
// 3's interview notes enter the system (Module 3 never records results
// itself) — see §1's "Also supports" column and the facilitator's
// "Assembling the inventory" section for how the rest of the inventory is
// assembled from upstream Responses rather than asked here.
const EVIDENCE_QUESTIONS: QuestionContent[] = [
  {
    questionKey: "evidence_additions",
    sequenceIndex: 1,
    questionGroup: "evidence_inventory",
    questionText:
      "What evidence exists outside the confirmed Responses of earlier modules — Module 3 interview notes, informal signals, public complaints, casual remarks, observed patterns?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "evidence_level",
    sequenceIndex: 2,
    questionGroup: "evidence_maturity",
    questionText:
      "What is the highest evidence level reached for this customer and problem?",
    helpText: null,
    placeholderText: null,
    responseType: "single_choice",
    isRequired: true,
    allowSkip: false,
    options: EVIDENCE_LEVEL_OPTIONS,
    conditions: {},
  },
  {
    questionKey: "evidence_level_reasoning",
    sequenceIndex: 3,
    questionGroup: "evidence_maturity",
    questionText:
      "What specifically supports that level, and what is missing from the level above?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "observed_behaviour",
    sequenceIndex: 4,
    questionGroup: "behavioural_evidence",
    questionText:
      "What has this customer been observed doing about the problem — workarounds built, money spent, people assigned, processes changed, time repeatedly invested, or tools abandoned?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "strongest_counterargument",
    sequenceIndex: 5,
    questionGroup: "falsifiability",
    questionText:
      "What is the strongest case that this problem is not painful enough to pay for, or that existing solutions are already good enough?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "counterargument_defence",
    sequenceIndex: 6,
    questionGroup: "falsifiability",
    questionText:
      "What evidence answers that case, and where does the defence run out?",
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
    sequenceIndex: 7,
    questionGroup: "roadmap",
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
  rendererKey: null,
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
          "Evidence strength (1–5)",
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
        key: "inventory_strength_scored",
        type: "table_column_scored_reasoning",
        level: 2,
        heading: "Evidence Inventory",
        column: "Evidence strength (1–5)",
        minimum: 1,
        maximum: 5,
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
        requiredColumns: [
          "Behaviour",
          "What it proves",
          "Evidence strength (1–5)",
        ],
      },
      {
        key: "behavioural_strength_scored",
        type: "table_column_scored_reasoning",
        level: 2,
        heading: "Behavioural Evidence Log",
        column: "Evidence strength (1–5)",
        minimum: 1,
        maximum: 5,
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
        key: "maturity_level_matches_response",
        type: "label_matches_response",
        label: "Current level",
        scope: { level: 2, heading: "Evidence Maturity Level" },
        responseKey: "evidence_level",
      },
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
    "Two or three experiments that fit the Founder's real time, budget and access constraints, each with a pre-set pass condition, fail condition and expected evidence signal strength. Start Here expands the first experiment; it never authors new criteria for it.",
  isRequired: true,
  artifactType: "document",
  sourceFormat: "markdown",
  outputFormat: "markdown",
  requiredFilename: "Validation-Roadmap-30-Day.md",
  rendererKey: "validation_roadmap_workbook_v1",
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
          { level: 3, heading: "Expected evidence signal strength" },
          { level: 2, heading: "Start Here" },
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
          "Expected evidence signal strength (1–5)",
          "30-day window",
        ],
      },
      {
        key: "experiment_signal_strength_range",
        type: "table_column_integer_range",
        level: 2,
        heading: "Experiments",
        column: "Expected evidence signal strength (1–5)",
        minimum: 1,
        maximum: 5,
      },
      {
        key: "signal_strength_anchors",
        type: "range_named_items",
        level: 3,
        heading: "Expected evidence signal strength",
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

// The Founder's raw interview record, and Module 4's source of truth for
// what the customers actually said. `evidence_additions` carries extracts
// from it into the graded document, but it is deliberately lossy — the
// facilitator saves this file in Block 1 before any Response is written,
// then re-reads it with `get_artifact` for every later block, so a Module
// resumed in a new chat a week later still has the complete record.
// Deliberately unlike the two artefacts above:
//  - `isRequired: false`, so it never blocks completeModuleAttempt — the
//    "did you actually interview anyone" gate lives in the facilitator
//    prompt, which grades thin notes rather than rejecting them. Optional
//    to the completion check, not optional to the Module;
//  - `validatorKey: null` (with the empty validationConfig that implies),
//    because raw notes have no structure worth failing a Founder over. The
//    template below is formatting guidance for the assistant, not a
//    contract enforced on submission.
// First in sequence, because it is the first thing that happens here. That
// used to collide with several consumers reading `expectedArtifacts[0]` as
// the Module's headline output (the module catalog card's "Produces …",
// the dashboard's saved/not-saved tracking) — an ungraded inbound record
// is not what this Module produces. Those now go through apps/web's
// `headlineArtifact`, which picks the first *required* Artifact, so
// sequence order is free to describe when things happen.
const INTERVIEW_NOTES_ARTIFACT: ArtifactContent = {
  artifactKey: "interview_notes",
  sequenceIndex: 1,
  name: "Interview Notes",
  description:
    "The Module 3 problem interviews as the Founder recorded them, normalised to Markdown and kept in the workspace. Raw input to the evidence assessment, accepted at whatever quality it arrives in.",
  isRequired: false,
  artifactType: "document",
  sourceFormat: "markdown",
  outputFormat: "markdown",
  requiredFilename: "Interview-Notes.md",
  rendererKey: null,
  validatorKey: null,
  allowedMimeTypes: ["text/markdown", "text/plain"],
  maxFileSizeBytes: 262_144,
  maxFiles: 1,
  outputConfig: {
    schemaVersion: 1,
    templateFormat: "markdown",
    templateMarkdown: INTERVIEW_NOTES_TEMPLATE,
  },
  validationConfig: {},
};

export const MODULE_4_CONTENT: ModuleContent = {
  moduleKey: "module-04-evidence-of-unmet-need",
  sequenceIndex: 4,
  title: "Proof",
  subtitle:
    "Grade what you actually know against what you believe, and plan the next 30 days",
  description:
    "Seven confirmed structured answers saved field by field, an Evidence of Unmet Need assessment (including Module 3's interview notes), and a 30-Day Validation Roadmap. Upstream validation statuses are historical snapshots, never a cap.",
  objective:
    "Reconcile what the Founder believes against what they have actually observed, grade the evidence, and plan the next 30 days of validation.",
  moduleType: "standard",
  isRequired: true,
  allowRevisions: true,
  completionMode: "artifact_and_confirmation",
  estimatedMinutes: 50,
  isPublishable: true,
  questions: EVIDENCE_QUESTIONS,
  artifacts: [
    INTERVIEW_NOTES_ARTIFACT,
    EVIDENCE_OF_UNMET_NEED_ARTIFACT,
    VALIDATION_ROADMAP_ARTIFACT,
  ],
};
