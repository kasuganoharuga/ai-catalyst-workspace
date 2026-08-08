import { ServiceError } from "@ai-catalyst/services/errors";

import {
  extractConfirmedAnswer,
  extractLabelValue,
  extractNonTableProse,
  getSection,
  isSectionSubstantive,
  isSubstantiveText,
  matchesRecordedUnknown,
  normalizeComparisonValue,
  parseTable,
  sectionExists,
  sectionHasSubstantiveLabel,
  substantiveListItems,
  tableColumnIndex,
} from "@ai-catalyst/services/artifact/internal/markdown-sections";
import {
  StructuredMarkdownValidationConfigSchema,
  type DraftRule,
  type HeadingRef,
  type SubmissionRule,
} from "@ai-catalyst/services/artifact/internal/validators/rule-schema";
import type {
  ValidationContext,
  ValidationContextResponse,
  ValidationRunResult,
  Validator,
} from "./types.js";

// Generic rule-driven validator for the Markdown artefacts in Modules 2, 3
// and 4 (and any future module built the same way) — one implementation
// instead of one per artefact, since every rule these artefacts need is
// declarative and is already expressed that way in each module's
// `validationConfig`. See docs on the rule vocabulary in rule-schema.ts.

interface RuleCheck {
  key: string;
  passed: boolean;
  message?: string;
}

interface LabelRef {
  label: string;
  scope?: HeadingRef;
}

function getResponse(
  ctx: ValidationContext,
  questionKey: string,
): ValidationContextResponse | undefined {
  return ctx.responses.find((response) => response.questionKey === questionKey);
}

/** The Response's confirmed answer, parsed out of the save protocol's `CONFIRMED ANSWER` block. `null` when unanswered. */
function confirmedAnswerFor(
  ctx: ValidationContext,
  questionKey: string,
): string | null {
  const response = getResponse(ctx, questionKey);
  if (!response || response.answerText === null) {
    return null;
  }
  return extractConfirmedAnswer(response.answerText);
}

function scopedContent(
  ctx: ValidationContext,
  scope: HeadingRef | undefined,
): string {
  if (!scope) {
    return ctx.content;
  }
  return getSection(ctx.content, scope.level, scope.heading) ?? "";
}

function labelRefValue(ref: LabelRef, ctx: ValidationContext): string | null {
  return extractLabelValue(scopedContent(ctx, ref.scope), ref.label);
}

/**
 * Whether a section may legitimately be empty because the Founder honestly
 * does not know — no substantive list items or table rows, substantive
 * prose exists, and that prose names the gap explicitly (see
 * RECORDED_UNKNOWN_PATTERNS). Never satisfied by "any non-empty prose with
 * no list items", which would pass "TBD" or a confident, unevidenced claim.
 */
function hasRecordedUnknownEscape(
  ctx: ValidationContext,
  level: number,
  heading: string,
): boolean {
  const body = getSection(ctx.content, level, heading);
  if (body === null) {
    return false;
  }
  if (substantiveListItems(body).length > 0) {
    return false;
  }
  if ((parseTable(body)?.rows.length ?? 0) > 0) {
    return false;
  }
  const prose = extractNonTableProse(body);
  return isSubstantiveText(prose) && matchesRecordedUnknown(prose);
}

function rowsFor(
  ctx: ValidationContext,
  level: number,
  heading: string,
): string[][] {
  const body = getSection(ctx.content, level, heading) ?? "";
  return parseTable(body)?.rows ?? [];
}

function headersFor(
  ctx: ValidationContext,
  level: number,
  heading: string,
): string[] {
  const body = getSection(ctx.content, level, heading) ?? "";
  return parseTable(body)?.headers ?? [];
}

/**
 * Parses one Markdown table cell shaped `N <sep> reasoning` — an integer,
 * then `—`, `:`, or a hyphen with a space on both sides, then text.
 * Deliberately narrow: a bare hyphen with no surrounding space is not
 * accepted as the separator, so "3-5" and "3/5" are rejected as malformed
 * rather than misread as score 3 with reasoning "5".
 */
function parseScoredReasoningCell(
  raw: string,
): { score: number; reasoning: string } | null {
  const trimmed = raw.trim();
  let match = /^(-?\d+)\s*(?:—|:)\s*(.+)$/.exec(trimmed);
  if (!match) {
    match = /^(-?\d+) - (.+)$/.exec(trimmed);
  }
  if (!match) {
    return null;
  }
  return { score: Number.parseInt(match[1], 10), reasoning: match[2].trim() };
}

function parseIntegerCell(raw: string): number | null {
  const trimmed = raw.trim();
  return /^-?\d+$/.test(trimmed) ? Number.parseInt(trimmed, 10) : null;
}

// ---------------------------------------------------------------------------
// Draft rules
// ---------------------------------------------------------------------------

function checkSectionsExist(
  rule: Extract<DraftRule, { type: "sections_exist" }>,
  ctx: ValidationContext,
): RuleCheck {
  const missing = rule.sections.filter(
    (s) => !sectionExists(ctx.content, s.level, s.heading),
  );
  return {
    key: rule.key,
    passed: missing.length === 0,
    message:
      missing.length === 0
        ? undefined
        : `Missing required heading(s): ${missing.map((s) => s.heading).join(", ")}.`,
  };
}

function checkSectionNonEmpty(
  rule: Extract<DraftRule, { type: "section_non_empty" }>,
  ctx: ValidationContext,
): RuleCheck {
  const passed = isSectionSubstantive(ctx.content, rule.level, rule.heading);
  return {
    key: rule.key,
    passed,
    message: passed
      ? undefined
      : `Section "${rule.heading}" is missing or not yet filled in.`,
  };
}

function checkMinimumNamedItems(
  rule: Extract<DraftRule, { type: "minimum_named_items" }>,
  ctx: ValidationContext,
): RuleCheck {
  const body = getSection(ctx.content, rule.level, rule.heading) ?? "";
  const count = substantiveListItems(body).length;
  const passed =
    count >= rule.minimum ||
    (rule.orRecordedUnknown === true &&
      hasRecordedUnknownEscape(ctx, rule.level, rule.heading));
  return {
    key: rule.key,
    passed,
    message: passed
      ? undefined
      : `Expected at least ${rule.minimum} item(s) in "${rule.heading}", found ${count}.`,
  };
}

function checkRangeNamedItems(
  rule: Extract<DraftRule, { type: "range_named_items" }>,
  ctx: ValidationContext,
): RuleCheck {
  const body = getSection(ctx.content, rule.level, rule.heading) ?? "";
  const count = substantiveListItems(body).length;
  const passed =
    (count >= rule.minimum && count <= rule.maximum) ||
    (rule.orRecordedUnknown === true &&
      hasRecordedUnknownEscape(ctx, rule.level, rule.heading));
  return {
    key: rule.key,
    passed,
    message: passed
      ? undefined
      : `Expected ${rule.minimum}-${rule.maximum} item(s) in "${rule.heading}", found ${count}.`,
  };
}

function checkMinimumTableRows(
  rule: Extract<DraftRule, { type: "minimum_table_rows" }>,
  ctx: ValidationContext,
): RuleCheck {
  const count = rowsFor(ctx, rule.level, rule.heading).length;
  const passed =
    count >= rule.minimum ||
    (rule.orRecordedUnknown === true &&
      hasRecordedUnknownEscape(ctx, rule.level, rule.heading));
  return {
    key: rule.key,
    passed,
    message: passed
      ? undefined
      : `Expected at least ${rule.minimum} row(s) in "${rule.heading}", found ${count}.`,
  };
}

function checkRangeTableRows(
  rule: Extract<DraftRule, { type: "range_table_rows" }>,
  ctx: ValidationContext,
): RuleCheck {
  const count = rowsFor(ctx, rule.level, rule.heading).length;
  const passed =
    (count >= rule.minimum && count <= rule.maximum) ||
    (rule.orRecordedUnknown === true &&
      hasRecordedUnknownEscape(ctx, rule.level, rule.heading));
  return {
    key: rule.key,
    passed,
    message: passed
      ? undefined
      : `Expected ${rule.minimum}-${rule.maximum} row(s) in "${rule.heading}", found ${count}.`,
  };
}

// Cell-level table rules (this one and every one below) pass vacuously when
// the table has no data rows — whether an empty table is legal is the
// paired row-count rule's job, so the two never contradict each other.

function checkTableRequiredCells(
  rule: Extract<DraftRule, { type: "table_required_cells" }>,
  ctx: ValidationContext,
): RuleCheck {
  const headers = headersFor(ctx, rule.level, rule.heading);
  const rows = rowsFor(ctx, rule.level, rule.heading);
  if (rows.length === 0) {
    return { key: rule.key, passed: true };
  }
  const missingColumns = rule.requiredColumns.filter(
    (column) => tableColumnIndex(headers, column) === -1,
  );
  if (missingColumns.length > 0) {
    return {
      key: rule.key,
      passed: false,
      message: `Table "${rule.heading}" is missing column(s): ${missingColumns.join(", ")}.`,
    };
  }
  const problems: string[] = [];
  rows.forEach((row, rowIndex) => {
    rule.requiredColumns.forEach((column) => {
      const cell = row[tableColumnIndex(headers, column)] ?? "";
      if (!isSubstantiveText(cell)) {
        problems.push(`row ${rowIndex + 1} column "${column}"`);
      }
    });
  });
  return {
    key: rule.key,
    passed: problems.length === 0,
    message:
      problems.length === 0
        ? undefined
        : `Missing content in "${rule.heading}": ${problems.join("; ")}.`,
  };
}

function checkTableColumnExactSequence(
  rule: Extract<DraftRule, { type: "table_column_exact_sequence" }>,
  ctx: ValidationContext,
): RuleCheck {
  const headers = headersFor(ctx, rule.level, rule.heading);
  const rows = rowsFor(ctx, rule.level, rule.heading);
  if (rows.length === 0) {
    return { key: rule.key, passed: true };
  }
  const idx = tableColumnIndex(headers, rule.column);
  if (idx === -1) {
    return {
      key: rule.key,
      passed: false,
      message: `Column "${rule.column}" not found in "${rule.heading}".`,
    };
  }
  const actual = rows.map((row) => normalizeComparisonValue(row[idx] ?? ""));
  const expected = rule.values.map((value) => normalizeComparisonValue(value));
  const passed =
    actual.length === expected.length &&
    actual.every((v, i) => v === expected[i]);
  return {
    key: rule.key,
    passed,
    message: passed
      ? undefined
      : `Expected "${rule.column}" in "${rule.heading}" to read [${rule.values.join(", ")}] in order, found [${rows.map((row) => row[idx]).join(", ")}].`,
  };
}

function checkTableColumnIntegerRange(
  rule: Extract<DraftRule, { type: "table_column_integer_range" }>,
  ctx: ValidationContext,
): RuleCheck {
  const headers = headersFor(ctx, rule.level, rule.heading);
  const rows = rowsFor(ctx, rule.level, rule.heading);
  if (rows.length === 0) {
    return { key: rule.key, passed: true };
  }
  const idx = tableColumnIndex(headers, rule.column);
  if (idx === -1) {
    return {
      key: rule.key,
      passed: false,
      message: `Column "${rule.column}" not found in "${rule.heading}".`,
    };
  }
  const problems: string[] = [];
  rows.forEach((row, rowIndex) => {
    const raw = (row[idx] ?? "").trim();
    if (raw.length === 0) {
      if (!rule.allowBlank) {
        problems.push(`row ${rowIndex + 1} is blank`);
      }
      return;
    }
    const value = parseIntegerCell(raw);
    if (value === null || value < rule.minimum || value > rule.maximum) {
      problems.push(`row ${rowIndex + 1} has "${raw}"`);
    }
  });
  return {
    key: rule.key,
    passed: problems.length === 0,
    message:
      problems.length === 0
        ? undefined
        : `"${rule.column}" in "${rule.heading}" must be an integer ${rule.minimum}-${rule.maximum}` +
          `${rule.allowBlank ? " (or blank)" : ""}: ${problems.join("; ")}.`,
  };
}

function checkTableColumnEnum(
  rule: Extract<DraftRule, { type: "table_column_enum" }>,
  ctx: ValidationContext,
): RuleCheck {
  const headers = headersFor(ctx, rule.level, rule.heading);
  const rows = rowsFor(ctx, rule.level, rule.heading);
  if (rows.length === 0) {
    return { key: rule.key, passed: true };
  }
  const idx = tableColumnIndex(headers, rule.column);
  if (idx === -1) {
    return {
      key: rule.key,
      passed: false,
      message: `Column "${rule.column}" not found in "${rule.heading}".`,
    };
  }
  const allowedNormalized = rule.allowed.map((value) =>
    normalizeComparisonValue(value),
  );
  const problems: string[] = [];
  rows.forEach((row, rowIndex) => {
    const raw = (row[idx] ?? "").trim();
    if (!allowedNormalized.includes(normalizeComparisonValue(raw))) {
      problems.push(`row ${rowIndex + 1} has "${raw}"`);
    }
  });
  return {
    key: rule.key,
    passed: problems.length === 0,
    message:
      problems.length === 0
        ? undefined
        : `"${rule.column}" in "${rule.heading}" must be one of [${rule.allowed.join(", ")}]: ${problems.join("; ")}.`,
  };
}

function checkTableColumnScoredReasoning(
  rule: Extract<DraftRule, { type: "table_column_scored_reasoning" }>,
  ctx: ValidationContext,
): RuleCheck {
  const headers = headersFor(ctx, rule.level, rule.heading);
  const rows = rowsFor(ctx, rule.level, rule.heading);
  if (rows.length === 0) {
    return { key: rule.key, passed: true };
  }
  const idx = tableColumnIndex(headers, rule.column);
  if (idx === -1) {
    return {
      key: rule.key,
      passed: false,
      message: `Column "${rule.column}" not found in "${rule.heading}".`,
    };
  }
  const problems: string[] = [];
  rows.forEach((row, rowIndex) => {
    const raw = (row[idx] ?? "").trim();
    const parsed = parseScoredReasoningCell(raw);
    if (
      !parsed ||
      parsed.score < rule.minimum ||
      parsed.score > rule.maximum ||
      !isSubstantiveText(parsed.reasoning)
    ) {
      problems.push(`row ${rowIndex + 1} has "${raw}"`);
    }
  });
  return {
    key: rule.key,
    passed: problems.length === 0,
    message:
      problems.length === 0
        ? undefined
        : `"${rule.column}" in "${rule.heading}" must read "<${rule.minimum}-${rule.maximum}> — reasoning": ${problems.join("; ")}.`,
  };
}

function checkLabelPresent(
  rule: Extract<DraftRule, { type: "label_present" }>,
  ctx: ValidationContext,
): RuleCheck {
  const passed = sectionHasSubstantiveLabel(
    ctx.content,
    rule.label,
    rule.scope,
  );
  return {
    key: rule.key,
    passed,
    message: passed
      ? undefined
      : `Label "${rule.label}" is missing or not yet filled in${rule.scope ? ` under "${rule.scope.heading}"` : ""}.`,
  };
}

function checkLabelEnum(
  rule: Extract<DraftRule, { type: "label_enum" }>,
  ctx: ValidationContext,
): RuleCheck {
  const value = labelRefValue({ label: rule.label, scope: rule.scope }, ctx);
  const allowedNormalized = rule.allowed.map((option) =>
    normalizeComparisonValue(option),
  );
  const passed =
    value !== null &&
    allowedNormalized.includes(normalizeComparisonValue(value));
  return {
    key: rule.key,
    passed,
    message: passed
      ? undefined
      : `Expected "${rule.label}" to be one of [${rule.allowed.join(", ")}], found "${value ?? "(none)"}".`,
  };
}

function countSentences(value: string): number {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return 0;
  }
  const parts = trimmed
    .split(/[.!?]+/)
    .filter((part) => part.trim().length > 0);
  return Math.max(1, parts.length);
}

function checkLabelValueCompact(
  rule: Extract<DraftRule, { type: "label_value_compact" }>,
  ctx: ValidationContext,
): RuleCheck {
  const value = labelRefValue({ label: rule.label, scope: rule.scope }, ctx);
  if (value === null || !isSubstantiveText(value)) {
    return {
      key: rule.key,
      passed: false,
      message: `${rule.label} must be a short recognition-card line, not a narrative paragraph. Reformat without changing or adding facts.`,
    };
  }
  const tooLong = value.length > rule.maxChars;
  const tooManySentences = countSentences(value) > rule.maxSentences;
  const passed = !tooLong && !tooManySentences;
  return {
    key: rule.key,
    passed,
    message: passed
      ? undefined
      : `${rule.label} must be a short recognition-card line, not a narrative paragraph. Reformat without changing or adding facts.`,
  };
}

function runDraftRule(rule: DraftRule, ctx: ValidationContext): RuleCheck {
  switch (rule.type) {
    case "sections_exist":
      return checkSectionsExist(rule, ctx);
    case "section_non_empty":
      return checkSectionNonEmpty(rule, ctx);
    case "minimum_named_items":
      return checkMinimumNamedItems(rule, ctx);
    case "range_named_items":
      return checkRangeNamedItems(rule, ctx);
    case "minimum_table_rows":
      return checkMinimumTableRows(rule, ctx);
    case "range_table_rows":
      return checkRangeTableRows(rule, ctx);
    case "table_required_cells":
      return checkTableRequiredCells(rule, ctx);
    case "table_column_exact_sequence":
      return checkTableColumnExactSequence(rule, ctx);
    case "table_column_integer_range":
      return checkTableColumnIntegerRange(rule, ctx);
    case "table_column_enum":
      return checkTableColumnEnum(rule, ctx);
    case "table_column_scored_reasoning":
      return checkTableColumnScoredReasoning(rule, ctx);
    case "label_present":
      return checkLabelPresent(rule, ctx);
    case "label_enum":
      return checkLabelEnum(rule, ctx);
    case "label_value_compact":
      return checkLabelValueCompact(rule, ctx);
  }
}

// ---------------------------------------------------------------------------
// Submission rules
// ---------------------------------------------------------------------------

function checkLabelMatchesResponse(
  rule: Extract<SubmissionRule, { type: "label_matches_response" }>,
  ctx: ValidationContext,
): RuleCheck {
  const labelValue = labelRefValue(
    { label: rule.label, scope: rule.scope },
    ctx,
  );
  const responseValue = confirmedAnswerFor(ctx, rule.responseKey);
  const passed =
    labelValue !== null &&
    responseValue !== null &&
    normalizeComparisonValue(labelValue) ===
      normalizeComparisonValue(responseValue);
  return {
    key: rule.key,
    passed,
    message: passed
      ? undefined
      : `"${rule.label}" ("${labelValue ?? "(none)"}") does not match the confirmed response for ` +
        `"${rule.responseKey}" ("${responseValue ?? "(none)"}").`,
  };
}

function checkLabelsAgree(
  rule: Extract<SubmissionRule, { type: "labels_agree" }>,
  ctx: ValidationContext,
): RuleCheck {
  const a = labelRefValue(rule.labelA, ctx);
  const b = labelRefValue(rule.labelB, ctx);
  const passed =
    a !== null &&
    b !== null &&
    normalizeComparisonValue(a) === normalizeComparisonValue(b);
  return {
    key: rule.key,
    passed,
    message: passed
      ? undefined
      : `"${rule.labelA.label}" ("${a ?? "(none)"}") and "${rule.labelB.label}" ("${b ?? "(none)"}") disagree.`,
  };
}

function checkLabelsMatchFirstTableRow(
  rule: Extract<SubmissionRule, { type: "labels_match_first_table_row" }>,
  ctx: ValidationContext,
): RuleCheck {
  const headers = headersFor(ctx, rule.table.level, rule.table.heading);
  const rows = rowsFor(ctx, rule.table.level, rule.table.heading);
  if (rows.length === 0) {
    return { key: rule.key, passed: true };
  }
  const firstRow = rows[0];
  const problems: string[] = [];
  for (const mapping of rule.mappings) {
    const columnIndex = tableColumnIndex(headers, mapping.column);
    if (columnIndex === -1) {
      problems.push(
        `column "${mapping.column}" not found in "${rule.table.heading}"`,
      );
      continue;
    }
    const labelValue = labelRefValue(
      { label: mapping.label, scope: mapping.scope },
      ctx,
    );
    const cellValue = firstRow[columnIndex] ?? "";
    if (
      labelValue === null ||
      normalizeComparisonValue(labelValue) !==
        normalizeComparisonValue(cellValue)
    ) {
      problems.push(
        `"${mapping.label}" ("${labelValue ?? "(none)"}") does not match "${mapping.column}" row 1 ("${cellValue}")`,
      );
    }
  }
  return {
    key: rule.key,
    passed: problems.length === 0,
    message: problems.length === 0 ? undefined : problems.join("; "),
  };
}

function runSubmissionRule(
  rule: SubmissionRule,
  ctx: ValidationContext,
): RuleCheck {
  switch (rule.type) {
    case "label_matches_response":
      return checkLabelMatchesResponse(rule, ctx);
    case "labels_agree":
      return checkLabelsAgree(rule, ctx);
    case "labels_match_first_table_row":
      return checkLabelsMatchFirstTableRow(rule, ctx);
  }
}

function combineResults(checks: RuleCheck[]): ValidationRunResult {
  const issues = checks
    .filter((check) => !check.passed)
    .map((check) => check.message ?? `Check "${check.key}" failed.`);
  const passed = issues.length === 0;
  const score =
    checks.length === 0
      ? 100
      : Math.round(
          (checks.filter((check) => check.passed).length / checks.length) * 100,
        );
  return { checks, issues, warnings: [], passed, score };
}

// The seed gate (content-seed/db/modules.ts) already parses every
// validationConfig before it reaches the database, so a parse failure here
// means seeded content diverged from its schema after the fact — a
// deployment inconsistency, not a business error a caller can act on.
function parseConfig(ctx: ValidationContext) {
  const result = StructuredMarkdownValidationConfigSchema.safeParse(
    ctx.validationConfig,
  );
  if (!result.success) {
    throw new ServiceError(
      "INTERNAL_INVARIANT_ERROR",
      `structured_markdown_v1 received a validationConfig that does not match its schema: ${result.error.message}`,
    );
  }
  return result.data;
}

function runDraftCheck(ctx: ValidationContext): ValidationRunResult {
  const config = parseConfig(ctx);
  return combineResults(
    config.draftRules.map((rule) => runDraftRule(rule, ctx)),
  );
}

function runOfficialCheck(ctx: ValidationContext): ValidationRunResult {
  const config = parseConfig(ctx);
  const draftChecks = config.draftRules.map((rule) => runDraftRule(rule, ctx));
  const submissionChecks = config.submissionRules.map((rule) =>
    runSubmissionRule(rule, ctx),
  );
  return combineResults([...draftChecks, ...submissionChecks]);
}

export const structuredMarkdownV1: Validator = {
  validatorKey: "structured_markdown_v1",
  validatorVersion: "1.0.0",
  runDraftCheck,
  runOfficialCheck,
};
