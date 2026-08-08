import type {
  ArtifactContent,
  ModuleContent,
  QuestionContent,
} from "../types.js";

// Ported from the reviewed skills/module-02-customer-avatar/prompts/module-02-prompt-set.md
// (§1 field ownership, §3 question rows, §5 artifact generator). That
// document is canonical; it superseded an earlier draft of this file whose
// `avatar_*` question keys and three-artefact shape no longer match it.
//
// One artefact only — the prompt set explicitly does not produce an
// interview or validation plan or an investor slide in this module.

const IDEAL_CUSTOMER_AVATAR_TEMPLATE = `# Ideal Customer Avatar

## Venture
- Venture name:

## Segment

## Snapshot

**WHO:**

**WHERE:**

**STAGE:**

**CURRENT COMMERCIAL MOMENT:**

## Situation

## Unmet Needs

### Functional — what they need done

1.
2.
3.

### Emotional and social — what they feel

1.
2.
3.

## Buying Signals

### Tier 1 — high intent, act within 24–48 hours

-
-
-

### Tier 2 — building intent, nurture over 4–12 weeks

-
-
-

## Disqualifiers

-
-
-

## Core Promise

## Validation Status

This section records the evidence available when this version of the Avatar was created. It is a
current snapshot, not a final validation verdict.

**Current level:** Assumed / Interviewed / Paying

### Based on observation

### Founder assumptions

### Important unknowns

### Contradicting evidence

### Highest-priority validation questions
`;

const VALIDATION_STATUS_OPTIONS = [
  { value: "assumed", label: "Assumed" },
  { value: "interviewed", label: "Interviewed" },
  { value: "paying", label: "Paying" },
];

// One question per confirmed field. The Facilitator asks each block's own
// opener (in the prompt set's §2, not here), converges into every field the
// block covers, then saves each field separately under its own
// `question_key` — these `question_text` values are the canonical statement
// of what each field must establish, snapshotted for the audit trail, and
// are never read aloud verbatim.
const AVATAR_QUESTIONS: QuestionContent[] = [
  {
    questionKey: "customer_picture",
    sequenceIndex: 1,
    questionGroup: "snapshot",
    questionText:
      "Who is this customer — their role or life situation, the environment they operate in, and the relationship between the user, the decision-maker and the economic buyer?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "beachhead_segment",
    sequenceIndex: 2,
    questionGroup: "segment",
    questionText:
      "Which specific customer type inside that group is the beachhead, and what makes it the strongest starting point?",
    helpText: null,
    placeholderText: null,
    responseType: "short_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "customer_where",
    sequenceIndex: 3,
    questionGroup: "snapshot",
    questionText:
      "Where does this customer exist — country, market, ecosystem, and one or two places where a real example could be identified?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "customer_stage",
    sequenceIndex: 4,
    questionGroup: "snapshot",
    questionText:
      "What must already be true in the customer's world before this problem becomes urgent, and who is too early or too far along?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "commercial_moment",
    sequenceIndex: 5,
    questionGroup: "snapshot",
    questionText:
      "What event or deadline is this customer moving toward that creates a reason to act now rather than later?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "customer_situation",
    sequenceIndex: 6,
    questionGroup: "situation",
    questionText:
      "What concrete moment makes the problem urgent — the trigger, the goal, what they tried, why it fell short, and the cost of doing nothing?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "functional_needs",
    sequenceIndex: 7,
    questionGroup: "unmet_needs",
    questionText:
      "What outcomes does this customer need but cannot reliably achieve today?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "emotional_needs",
    sequenceIndex: 8,
    questionGroup: "unmet_needs",
    questionText:
      "What is emotionally and socially at stake for this customer in this problem?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "tier1_signals",
    sequenceIndex: 9,
    questionGroup: "buying_signals",
    questionText:
      "What observable actions show this customer is acting on the problem within 24–48 hours?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "tier2_signals",
    sequenceIndex: 10,
    questionGroup: "buying_signals",
    questionText:
      "What observable events show this customer will need a solution within four to twelve weeks?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "disqualifiers",
    sequenceIndex: 11,
    questionGroup: "disqualifiers",
    questionText:
      "Who looks like this customer but should be excluded, and why?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "core_promise",
    sequenceIndex: 12,
    questionGroup: "core_promise",
    questionText:
      "What result, reduced risk or retained capability is this customer actually buying?",
    helpText: null,
    placeholderText: null,
    responseType: "long_text",
    isRequired: true,
    allowSkip: false,
    options: [],
    conditions: {},
  },
  {
    questionKey: "validation_status",
    sequenceIndex: 13,
    questionGroup: "validation",
    questionText:
      "What is the highest evidence level reached for this exact customer profile?",
    helpText: null,
    placeholderText: null,
    responseType: "single_choice",
    isRequired: true,
    allowSkip: false,
    options: VALIDATION_STATUS_OPTIONS,
    conditions: {},
  },
];

const IDEAL_CUSTOMER_AVATAR_ARTIFACT: ArtifactContent = {
  artifactKey: "ideal_customer_avatar",
  sequenceIndex: 1,
  name: "Ideal Customer Avatar",
  description:
    "Locked-schema avatar: segment, snapshot, situation, functional and emotional unmet needs, tiered buying signals, disqualifiers, core promise, plus an internal Validation Status separating evidence from assumption.",
  isRequired: true,
  artifactType: "document",
  sourceFormat: "markdown",
  outputFormat: "markdown",
  requiredFilename: "Ideal-Customer-Avatar.md",
  rendererKey: "ideal_customer_avatar_html_v1",
  validatorKey: "structured_markdown_v1",
  allowedMimeTypes: ["text/markdown", "text/plain"],
  maxFileSizeBytes: 262_144,
  maxFiles: 1,
  outputConfig: {
    schemaVersion: 1,
    templateFormat: "markdown",
    templateMarkdown: IDEAL_CUSTOMER_AVATAR_TEMPLATE,
  },
  validationConfig: {
    schemaVersion: 1,
    draftRules: [
      {
        key: "required_sections",
        type: "sections_exist",
        sections: [
          { level: 2, heading: "Venture" },
          { level: 2, heading: "Segment" },
          { level: 2, heading: "Snapshot" },
          { level: 2, heading: "Situation" },
          { level: 2, heading: "Unmet Needs" },
          { level: 2, heading: "Buying Signals" },
          { level: 2, heading: "Disqualifiers" },
          { level: 2, heading: "Core Promise" },
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
        key: "segment_present",
        type: "section_non_empty",
        level: 2,
        heading: "Segment",
      },
      {
        key: "situation_present",
        type: "section_non_empty",
        level: 2,
        heading: "Situation",
      },
      {
        key: "core_promise_present",
        type: "section_non_empty",
        level: 2,
        heading: "Core Promise",
      },
      {
        key: "snapshot_who",
        type: "label_present",
        label: "WHO",
        scope: { level: 2, heading: "Snapshot" },
      },
      {
        key: "snapshot_where",
        type: "label_present",
        label: "WHERE",
        scope: { level: 2, heading: "Snapshot" },
      },
      {
        key: "snapshot_stage",
        type: "label_present",
        label: "STAGE",
        scope: { level: 2, heading: "Snapshot" },
      },
      {
        key: "snapshot_commercial_moment",
        type: "label_present",
        label: "CURRENT COMMERCIAL MOMENT",
        scope: { level: 2, heading: "Snapshot" },
      },
      {
        key: "functional_needs_range",
        type: "range_named_items",
        level: 3,
        heading: "Functional — what they need done",
        minimum: 3,
        maximum: 6,
        orRecordedUnknown: true,
      },
      {
        key: "emotional_needs_range",
        type: "range_named_items",
        level: 3,
        heading: "Emotional and social — what they feel",
        minimum: 3,
        maximum: 6,
        orRecordedUnknown: true,
      },
      {
        key: "tier1_signals_range",
        type: "range_named_items",
        level: 3,
        heading: "Tier 1 — high intent, act within 24–48 hours",
        minimum: 3,
        maximum: 5,
        orRecordedUnknown: true,
      },
      {
        key: "tier2_signals_range",
        type: "range_named_items",
        level: 3,
        heading: "Tier 2 — building intent, nurture over 4–12 weeks",
        minimum: 3,
        maximum: 5,
        orRecordedUnknown: true,
      },
      {
        key: "disqualifiers_minimum",
        type: "minimum_named_items",
        level: 2,
        heading: "Disqualifiers",
        minimum: 3,
        orRecordedUnknown: true,
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
        key: "current_level_enum",
        type: "label_enum",
        label: "Current level",
        scope: { level: 2, heading: "Validation Status" },
        allowed: ["assumed", "interviewed", "paying"],
      },
    ],
    submissionRules: [
      {
        key: "current_level_matches_response",
        type: "label_matches_response",
        label: "Current level",
        scope: { level: 2, heading: "Validation Status" },
        responseKey: "validation_status",
      },
    ],
  },
};

export const MODULE_2_CONTENT: ModuleContent = {
  moduleKey: "module-02-customer-avatar",
  sequenceIndex: 2,
  title: "Target Customer",
  subtitle:
    "Define exactly who you are building for, what they urgently need, and how to recognise when they are ready to buy",
  description:
    "Eight conversation blocks confirming every field, and one locked-schema Ideal Customer Avatar with an internal Validation Status. Completion is not validation.",
  objective:
    "Define exactly who you are building for, what they urgently need, how to recognise when they are ready to buy, and who should not be included.",
  moduleType: "standard",
  isRequired: true,
  allowRevisions: true,
  completionMode: "artifact_and_confirmation",
  estimatedMinutes: 60,
  isPublishable: true,
  questions: AVATAR_QUESTIONS,
  artifacts: [IDEAL_CUSTOMER_AVATAR_ARTIFACT],
};
