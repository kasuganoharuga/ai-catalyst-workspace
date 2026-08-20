import { z } from "zod";

// Shared by structured-markdown-v1.ts (which trusts these shapes at
// runtime) and content-seed/db/modules.ts (which parses `validationConfig`
// before writing it, so a malformed rule fails the seed rather than a
// Founder's `complete_module`). `.strict()` throughout the new schema so an
// unexpected field is an error, not silently dropped — the failure mode
// `pressure-test-verdict-v1.ts`'s `asRuleArray` has today.

const HeadingRefSchema = z
  .object({
    level: z.number().int().min(1).max(6),
    heading: z.string().min(1),
  })
  .strict();

export type HeadingRef = z.infer<typeof HeadingRefSchema>;

const RuleBaseSchema = z.object({ key: z.string().min(1) });

const SectionsExistRuleSchema = RuleBaseSchema.extend({
  type: z.literal("sections_exist"),
  sections: z.array(HeadingRefSchema).min(1),
}).strict();

const SectionNonEmptyRuleSchema = RuleBaseSchema.extend({
  type: z.literal("section_non_empty"),
  level: z.number().int().min(1).max(6),
  heading: z.string().min(1),
}).strict();

const MinimumNamedItemsRuleSchema = RuleBaseSchema.extend({
  type: z.literal("minimum_named_items"),
  level: z.number().int().min(1).max(6),
  heading: z.string().min(1),
  minimum: z.number().int().min(0),
  orRecordedUnknown: z.boolean().optional(),
}).strict();

const RangeNamedItemsRuleSchema = RuleBaseSchema.extend({
  type: z.literal("range_named_items"),
  level: z.number().int().min(1).max(6),
  heading: z.string().min(1),
  minimum: z.number().int().min(0),
  maximum: z.number().int().min(0),
  orRecordedUnknown: z.boolean().optional(),
}).strict();

const MinimumTableRowsRuleSchema = RuleBaseSchema.extend({
  type: z.literal("minimum_table_rows"),
  level: z.number().int().min(1).max(6),
  heading: z.string().min(1),
  minimum: z.number().int().min(0),
  orRecordedUnknown: z.boolean().optional(),
}).strict();

const RangeTableRowsRuleSchema = RuleBaseSchema.extend({
  type: z.literal("range_table_rows"),
  level: z.number().int().min(1).max(6),
  heading: z.string().min(1),
  minimum: z.number().int().min(0),
  maximum: z.number().int().min(0),
  orRecordedUnknown: z.boolean().optional(),
}).strict();

const TableRequiredCellsRuleSchema = RuleBaseSchema.extend({
  type: z.literal("table_required_cells"),
  level: z.number().int().min(1).max(6),
  heading: z.string().min(1),
  requiredColumns: z.array(z.string().min(1)).min(1),
}).strict();

// Verifies a table column's cells equal `values` in order with no repeats —
// e.g. Why This Is Urgent's Axis column must read Frequency, Cost, Urgency,
// not three "Frequency" rows.
const TableColumnExactSequenceRuleSchema = RuleBaseSchema.extend({
  type: z.literal("table_column_exact_sequence"),
  level: z.number().int().min(1).max(6),
  heading: z.string().min(1),
  column: z.string().min(1),
  values: z.array(z.string().min(1)).min(1),
}).strict();

// `allowBlank` permits an empty cell and only an empty cell — "High", "N/A"
// and "7/10" still fail. Used where a score has its own Reasoning column
// (Module 3's Score (1-10)) or carries no reasoning requirement at all
// (the Roadmap's Expected evidence signal strength column).
const TableColumnIntegerRangeRuleSchema = RuleBaseSchema.extend({
  type: z.literal("table_column_integer_range"),
  level: z.number().int().min(1).max(6),
  heading: z.string().min(1),
  column: z.string().min(1),
  minimum: z.number().int(),
  maximum: z.number().int(),
  allowBlank: z.boolean().optional(),
}).strict();

const TableColumnEnumRuleSchema = RuleBaseSchema.extend({
  type: z.literal("table_column_enum"),
  level: z.number().int().min(1).max(6),
  heading: z.string().min(1),
  column: z.string().min(1),
  allowed: z.array(z.string().min(1)).min(1),
}).strict();

// For a column with no separate Reasoning column (Evidence Inventory's and
// Behavioural Evidence Log's "Evidence strength (1-5)"), where the template
// and the facilitator both require every score to carry its reasoning
// inline: "3 - reasoning". A bare "3" is incomplete, not merely unscored.
const TableColumnScoredReasoningRuleSchema = RuleBaseSchema.extend({
  type: z.literal("table_column_scored_reasoning"),
  level: z.number().int().min(1).max(6),
  heading: z.string().min(1),
  column: z.string().min(1),
  minimum: z.number().int(),
  maximum: z.number().int(),
}).strict();

// Same inline-reasoning shape as scored_reasoning, but the grade is a word
// label (Weak / Moderate / Strong) rather than a 1–5 integer — so row-level
// signal strength never shares a numeric scale with Evidence Maturity Level.
const TableColumnLabeledReasoningRuleSchema = RuleBaseSchema.extend({
  type: z.literal("table_column_labeled_reasoning"),
  level: z.number().int().min(1).max(6),
  heading: z.string().min(1),
  column: z.string().min(1),
  allowed: z.array(z.string().min(1)).min(1),
}).strict();

// `scope` disambiguates a label that appears more than once in a template
// (e.g. "Current level" under both Evidence Maturity Level and Validation
// Status in Evidence-Of-Unmet-Need.md) — required whenever that is possible.
const LabelPresentRuleSchema = RuleBaseSchema.extend({
  type: z.literal("label_present"),
  label: z.string().min(1),
  scope: HeadingRefSchema.optional(),
}).strict();

const LabelEnumRuleSchema = RuleBaseSchema.extend({
  type: z.literal("label_enum"),
  label: z.string().min(1),
  allowed: z.array(z.string().min(1)).min(1),
  scope: HeadingRefSchema.optional(),
}).strict();

// Keeps Module 2 Snapshot cells at Capital Raise recognition-card density:
// a short scannable line, not an explanatory paragraph. Used so the
// generator can repair without changing facts.
const LabelValueCompactRuleSchema = RuleBaseSchema.extend({
  type: z.literal("label_value_compact"),
  label: z.string().min(1),
  maxChars: z.number().int().min(1),
  maxSentences: z.number().int().min(1),
  scope: HeadingRefSchema.optional(),
}).strict();

const DraftRuleSchema = z.discriminatedUnion("type", [
  SectionsExistRuleSchema,
  SectionNonEmptyRuleSchema,
  MinimumNamedItemsRuleSchema,
  RangeNamedItemsRuleSchema,
  MinimumTableRowsRuleSchema,
  RangeTableRowsRuleSchema,
  TableRequiredCellsRuleSchema,
  TableColumnExactSequenceRuleSchema,
  TableColumnIntegerRangeRuleSchema,
  TableColumnEnumRuleSchema,
  TableColumnScoredReasoningRuleSchema,
  TableColumnLabeledReasoningRuleSchema,
  LabelPresentRuleSchema,
  LabelEnumRuleSchema,
  LabelValueCompactRuleSchema,
]);

export type DraftRule = z.infer<typeof DraftRuleSchema>;

const LabelMatchesResponseRuleSchema = RuleBaseSchema.extend({
  type: z.literal("label_matches_response"),
  label: z.string().min(1),
  scope: HeadingRefSchema.optional(),
  responseKey: z.string().min(1),
}).strict();

const LabelRefSchema = z
  .object({
    label: z.string().min(1),
    scope: HeadingRefSchema.optional(),
  })
  .strict();

const LabelsAgreeRuleSchema = RuleBaseSchema.extend({
  type: z.literal("labels_agree"),
  labelA: LabelRefSchema,
  labelB: LabelRefSchema,
}).strict();

// Enforces "Start Here expands row 1, it does not author criteria" — each
// mapping's label (e.g. Start Here's "What counts as a pass") must equal
// the named column in the target table's first data row.
const LabelsMatchFirstTableRowRuleSchema = RuleBaseSchema.extend({
  type: z.literal("labels_match_first_table_row"),
  table: HeadingRefSchema,
  mappings: z
    .array(
      z
        .object({
          label: z.string().min(1),
          scope: HeadingRefSchema.optional(),
          column: z.string().min(1),
        })
        .strict(),
    )
    .min(1),
}).strict();

const SubmissionRuleSchema = z.discriminatedUnion("type", [
  LabelMatchesResponseRuleSchema,
  LabelsAgreeRuleSchema,
  LabelsMatchFirstTableRowRuleSchema,
]);

export type SubmissionRule = z.infer<typeof SubmissionRuleSchema>;

export const StructuredMarkdownValidationConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    draftRules: z.array(DraftRuleSchema),
    submissionRules: z.array(SubmissionRuleSchema),
  })
  .strict();

export type StructuredMarkdownValidationConfig = z.infer<
  typeof StructuredMarkdownValidationConfigSchema
>;

// Module 1's frozen configs under published v2 (see pressure-test-verdict-v1/v2.ts).
// Deliberately loose, not `.strict()`: this content is immutable and predates
// the RuleBase/heading-literal convention above (it uses `section` string
// keys into a hardcoded lookup table, not `{level, heading}`), so retrofitting
// strictness here would risk breaking published content for no benefit.
const LegacyRuleSchema = z.object({
  key: z.string().min(1),
  type: z.string().optional(),
  section: z.string().optional(),
  expected: z.number().optional(),
  minimum: z.number().optional(),
  allowed: z.array(z.string()).optional(),
  sections: z.array(z.string()).optional(),
});

export const LegacyValidationConfigSchema = z.object({
  schemaVersion: z.number().optional(),
  validatorKey: z.string().optional(),
  draftRules: z.array(LegacyRuleSchema).optional(),
  submissionRules: z.array(LegacyRuleSchema).optional(),
});

export type LegacyValidationConfig = z.infer<
  typeof LegacyValidationConfigSchema
>;

const EmptyConfigSchema = z.object({}).strict();

/**
 * Seed-time validationConfig parse — fail at seed, not at complete_module.
 * Dispatches on artifact `validator_key`, not the legacy optional copy inside the config.
 */
export function validateConfigForValidator(
  validatorKey: string | null,
  validationConfig: unknown,
): void {
  if (validatorKey === null) {
    EmptyConfigSchema.parse(validationConfig);
    return;
  }

  if (validatorKey === "structured_markdown_v1") {
    StructuredMarkdownValidationConfigSchema.parse(validationConfig);
    return;
  }

  const legacy = LegacyValidationConfigSchema.parse(validationConfig);
  if (
    legacy.validatorKey !== undefined &&
    legacy.validatorKey !== validatorKey
  ) {
    throw new Error(
      `validationConfig.validatorKey ("${legacy.validatorKey}") does not match this artifact's ` +
        `validator_key ("${validatorKey}").`,
    );
  }
}
