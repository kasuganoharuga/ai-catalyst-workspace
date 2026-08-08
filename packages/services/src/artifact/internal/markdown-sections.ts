// Markdown structure helpers. Originally written only for
// validators/pressure-test-verdict-v1.ts, on the grounds that a future
// Validator's template has a different heading/label vocabulary and a
// shared "generic Markdown artifact parser" would be premature
// generalization for a single caller. structured-markdown-v1.ts (Modules
// 2, 3 and 4) is the second and third and fourth caller that condition
// anticipated — it shares every function below rather than re-implementing
// them. Every function here is pure and takes plain strings — no
// DB/Storage/ActorContext involvement, matching the Validator contract's
// own "synchronous pure function" requirement.

interface HeadingLine {
  level: number;
  heading: string;
  lineIndex: number;
}

function parseHeadingLines(lines: string[]): HeadingLine[] {
  const result: HeadingLine[] = [];
  lines.forEach((line, lineIndex) => {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (match) {
      result.push({
        level: match[1].length,
        heading: match[2].trim(),
        lineIndex,
      });
    }
  });
  return result;
}

/**
 * Returns the body text of the first heading at exactly `level` whose
 * text matches `headingText` (case-insensitive), up to (not including)
 * the next heading at that level or shallower. `null` when no such
 * heading exists at all — distinct from an empty string, which means the
 * heading exists but has no content under it yet.
 */
export function getSection(
  content: string,
  level: number,
  headingText: string,
): string | null {
  const lines = content.split("\n");
  const headings = parseHeadingLines(lines);
  const target = headings.find(
    (heading) =>
      heading.level === level &&
      heading.heading.toLowerCase() === headingText.toLowerCase(),
  );
  if (!target) {
    return null;
  }
  const nextHeadingIndex = headings.findIndex(
    (heading) => heading.lineIndex > target.lineIndex && heading.level <= level,
  );
  const endLine =
    nextHeadingIndex === -1
      ? lines.length
      : headings[nextHeadingIndex].lineIndex;
  return lines
    .slice(target.lineIndex + 1, endLine)
    .join("\n")
    .trim();
}

export function sectionExists(
  content: string,
  level: number,
  headingText: string,
): boolean {
  return getSection(content, level, headingText) !== null;
}

export function isSectionNonEmpty(
  content: string,
  level: number,
  headingText: string,
): boolean {
  const body = getSection(content, level, headingText);
  return body !== null && body.trim().length > 0;
}

// The bullet branch requires the marker NOT be followed by another `*`
// (a `**bold**` label like `**Evidence note:**` must never be
// misread as a `*`-bulleted list item) and requires at least one space
// after the marker — the numbered branch keeps `\s*` (optional) since a
// numbered placeholder line like "1." with nothing after it is still a
// valid (if unfilled) list item.
const LIST_ITEM_PATTERN = /^\s*(?:\d+[.)]\s*|[-*](?!\*)\s+)(.*)$/;

/** Every markdown list-item line within `sectionBody`, trimmed (may be empty strings for unfilled placeholder lines like "1."). */
export function listItems(sectionBody: string): string[] {
  return sectionBody
    .split("\n")
    .map((line) => LIST_ITEM_PATTERN.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => match[1].trim());
}

export function nonEmptyListItems(sectionBody: string): string[] {
  return listItems(sectionBody).filter((item) => item.length > 0);
}

// ---------------------------------------------------------------------------
// Substantive-content detection
// ---------------------------------------------------------------------------
//
// The authoring templates under packages/toolkit-content carry
// `<angle-bracket authoring hints>`, unfilled placeholder lines and blank
// table rows. Every rule in structured-markdown-v1.ts that checks "is this
// present" must reject those, or a Founder (or a model) saving the raw
// template — or a naively stripped test skeleton — would clear validation.
// Legacy validators (pressure-test-verdict-v1/v2) do not use this: their
// frozen v1/v2 content never contained hint markup in the first place.

// This authoring convention never uses literal angle brackets in
// Founder-facing content, so a `<...>` span anywhere is read as an unfilled
// hint — including a hint embedded inside otherwise-real text, such as a
// Five Whys rung's own heading line `**Why <the question as it was
// asked>?**`, where only part of the line is the placeholder.
const CONTAINS_HINT_PATTERN = /<[^<>]*>/;
const TRIVIAL_FILLER_PATTERN = /^(?:tbd|todo|placeholder|n\/a|na)$/i;
const DASH_OR_ELLIPSIS_ONLY_PATTERN = /^[-—–.\s]+$/;

/** True for empty text, an unfilled `<hint>` span, `TBD`/`TODO`/`N/A`, or dash-/ellipsis-only text. */
export function isPlaceholderText(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;
  if (CONTAINS_HINT_PATTERN.test(trimmed)) return true;
  if (TRIVIAL_FILLER_PATTERN.test(trimmed)) return true;
  if (DASH_OR_ELLIPSIS_ONLY_PATTERN.test(trimmed)) return true;
  return false;
}

export function isSubstantiveText(text: string): boolean {
  return !isPlaceholderText(text);
}

/** Every list item in `sectionBody` whose text is substantive (see `isSubstantiveText`). */
export function substantiveListItems(sectionBody: string): string[] {
  return listItems(sectionBody).filter((item) => isSubstantiveText(item));
}

export function isSectionSubstantive(
  content: string,
  level: number,
  headingText: string,
): boolean {
  const body = getSection(content, level, headingText);
  return body !== null && isSubstantiveText(body);
}

// ---------------------------------------------------------------------------
// Markdown tables
// ---------------------------------------------------------------------------
//
// Five of the templates (Why This Is Urgent, What Customers Do Today,
// Evidence Inventory, Behavioural Evidence Log, Experiments, and the
// Evidence Maturity Level reference table) are tables, not lists — the
// list-oriented helpers above cannot see their rows.

/**
 * Splits one `| a | b | c |` line into cells, respecting an escaped pipe
 * (`\|`) inside a cell — verbatim customer quotes, pass/fail conditions and
 * contradicting-evidence text can legitimately contain a literal `|`, and a
 * naive `line.split("|")` would misalign every column after it.
 */
function tokenizeTableRow(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "\\" && line[i + 1] === "|") {
      current += "|";
      i += 1;
      continue;
    }
    if (char === "|") {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

// Strips simple Markdown emphasis markers (`**bold**`, `*italic*`) so
// comparisons — and, for the workbook renderers, drawn PDF content — see
// the underlying text rather than literal asterisks. Exported: several
// locked template strings (e.g. Pass Bar's preamble, the Expected evidence
// signal strength anchors) are entirely wrapped in `**...**` in the source
// Markdown, and a renderer drawing that text verbatim onto a page would
// show the asterisks.
export function stripMarkdownEmphasis(text: string): string {
  return text.replace(/\*\*([^*]*)\*\*/g, "$1").replace(/\*([^*]*)\*/g, "$1");
}

function parseTableRowCells(rawLine: string): string[] {
  const trimmed = rawLine.trim();
  const rawCells = tokenizeTableRow(trimmed);
  // A well-formed `| a | b |` row tokenizes to ["", " a ", " b ", ""] — drop
  // the empty leading/trailing cells produced by the frame pipes.
  const inner =
    rawCells.length >= 2 &&
    rawCells[0].trim().length === 0 &&
    rawCells[rawCells.length - 1].trim().length === 0
      ? rawCells.slice(1, -1)
      : rawCells;
  return inner.map((cell) => stripMarkdownEmphasis(cell.trim()).trim());
}

function isTableLine(line: string): boolean {
  return /^\s*\|/.test(line);
}

function isSeparatorRow(cells: string[]): boolean {
  return (
    cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell.trim()))
  );
}

export interface ParsedTable {
  headers: string[];
  /** Data rows with at least one substantive cell — blank placeholder rows (`| | | | |`) are excluded. */
  rows: string[][];
}

/**
 * Parses a Markdown table out of a section body. `null` when the section
 * has no header+separator+row structure at all (e.g. an empty section, or
 * one that is not a table). Returns `{ headers, rows: [] }` — not `null` —
 * when the table exists but every data row is blank; whether an empty
 * table is legal is a row-count rule's job, not this parser's.
 */
export function parseTable(sectionBody: string): ParsedTable | null {
  const lines = sectionBody.split("\n");
  const tableLineIndexes = lines.reduce<number[]>((acc, line, index) => {
    if (isTableLine(line)) acc.push(index);
    return acc;
  }, []);
  if (tableLineIndexes.length < 2) {
    return null;
  }

  const headerCells = parseTableRowCells(lines[tableLineIndexes[0]]);
  const separatorCells = parseTableRowCells(lines[tableLineIndexes[1]]);
  if (!isSeparatorRow(separatorCells)) {
    return null;
  }

  const rows = tableLineIndexes
    .slice(2)
    .map((lineIndex) => parseTableRowCells(lines[lineIndex]))
    .filter((cells) => cells.some((cell) => isSubstantiveText(cell)));

  return { headers: headerCells, rows };
}

/** Substantive data rows only (no headers, no separator, no all-blank rows). */
export function tableRows(sectionBody: string): string[][] {
  return parseTable(sectionBody)?.rows ?? [];
}

/** Case-insensitive column lookup; `-1` when `columnName` is not a header in this table. */
export function tableColumnIndex(
  headers: string[],
  columnName: string,
): number {
  const normalized = columnName.trim().toLowerCase();
  return headers.findIndex(
    (header) => header.trim().toLowerCase() === normalized,
  );
}

// Everything in `sectionBody` except table-row lines (header, separator and
// data rows alike) — used so an unfilled-table's header/`|---|` scaffolding
// is never mistaken for the Founder's own "no evidence recorded yet" prose
// when matching against RECORDED_UNKNOWN_PATTERNS below.
export function extractNonTableProse(sectionBody: string): string {
  return sectionBody
    .split("\n")
    .filter((line) => !isTableLine(line))
    .join("\n")
    .trim();
}

// ---------------------------------------------------------------------------
// Honest-unknown markers
// ---------------------------------------------------------------------------
//
// A count rule's `orRecordedUnknown` escape must not accept any non-empty
// prose with no list items — that would pass "TBD" or a confident but
// unevidenced assertion. It only accepts prose that names the gap
// explicitly, matched against the literal phrasings the templates ship —
// see docs on `orRecordedUnknown` in the Module 3/4 prompt sets.
export const RECORDED_UNKNOWN_PATTERNS: RegExp[] = [
  /\bunknown\b/i,
  /\bnot yet known\b/i,
  /\bnot determined\b/i,
  /\bnot tested yet\b/i,
  /\bnone recorded\b/i,
  /\bnone found yet\b/i,
  /\bno .+ recorded yet\b/i, // "No evidence recorded yet."
  /\bno .+ observed yet\b/i, // "No customer behaviour observed yet."
  /\bno .+ identified yet\b/i, // "No specific channel has been identified yet"
];

export function matchesRecordedUnknown(text: string): boolean {
  return RECORDED_UNKNOWN_PATTERNS.some((pattern) => pattern.test(text));
}

// ---------------------------------------------------------------------------
// Labels — `**Bold:**` and `- List item:` forms
// ---------------------------------------------------------------------------

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isLabelBoundaryLine(line: string): boolean {
  return (
    /^#{1,6}\s/.test(line) ||
    /^\s*\*\*[^*]+:\*\*/.test(line) ||
    /^\s*[-*](?!\*)\s+[^:]+:\s*/.test(line)
  );
}

/**
 * Finds an inline `**Label:**` marker, or a `- Label:` list-item marker
 * (the form every "Venture name" field uses), and returns the text that
 * follows it: inline text on the same line if present, otherwise the
 * following paragraph (collected until a blank line, the next heading, or
 * another label marker of either form). `null` when the marker itself is
 * entirely absent — distinct from an empty string, which means the marker
 * is present but nothing follows it yet.
 */
export function extractLabelValue(
  content: string,
  label: string,
): string | null {
  const lines = content.split("\n");
  const boldPattern = new RegExp(
    `^\\s*\\*\\*${escapeRegExp(label)}:\\*\\*\\s*(.*)$`,
    "i",
  );
  const listItemPattern = new RegExp(
    `^\\s*[-*](?!\\*)\\s+${escapeRegExp(label)}:\\s*(.*)$`,
    "i",
  );

  const markerIndex = lines.findIndex(
    (line) => boldPattern.test(line) || listItemPattern.test(line),
  );
  if (markerIndex === -1) {
    return null;
  }

  const matchedLine = lines[markerIndex];
  const inline = (
    boldPattern.exec(matchedLine)?.[1] ??
    listItemPattern.exec(matchedLine)?.[1] ??
    ""
  ).trim();
  if (inline.length > 0) {
    return inline;
  }

  // Skip a blank line (or a few) between the marker and the value block so
  // compact Snapshot cards can sit under `**WHO:**` / `**STAGE:**` without
  // looking like an empty label to the draft check.
  let i = markerIndex + 1;
  while (i < lines.length && lines[i].trim().length === 0) {
    i += 1;
  }

  const collected: string[] = [];
  for (; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim().length === 0) {
      break;
    }
    if (isLabelBoundaryLine(line)) {
      break;
    }
    collected.push(line.trim());
  }
  return collected.join(" ").trim();
}

export function sectionHasSubstantiveLabel(
  content: string,
  label: string,
  scope?: { level: number; heading: string },
): boolean {
  const searchContent = scope
    ? (getSection(content, scope.level, scope.heading) ?? "")
    : content;
  const value = extractLabelValue(searchContent, label);
  return value !== null && isSubstantiveText(value);
}

// ---------------------------------------------------------------------------
// The save protocol
// ---------------------------------------------------------------------------
//
// Modules 2-4 persist every confirmed answer wrapped in metadata:
//
//   CONFIRMED ANSWER
//   assumed
//
//   OBSERVATION BASIS
//   None recorded.
//   ...
//
// `label_matches_response` and similar rules must compare against the
// CONFIRMED ANSWER body, never the whole `answerText` — Module 1's plain,
// unwrapped answers still work, since a string with no such block returns
// unchanged.
const SAVE_PROTOCOL_LABELS = [
  "CONFIRMED ANSWER",
  "OBSERVATION BASIS",
  "ASSUMPTIONS",
  "UNKNOWNS",
  "CONTRADICTIONS",
  "CARRY-FORWARD CONTEXT",
];

export function extractConfirmedAnswer(answerText: string): string {
  const lines = answerText.split("\n");
  const labelIndex = lines.findIndex(
    (line) => line.trim() === "CONFIRMED ANSWER",
  );
  if (labelIndex === -1) {
    return answerText.trim();
  }

  const rest = lines.slice(labelIndex + 1);
  const nextLabelOffset = rest.findIndex((line) =>
    SAVE_PROTOCOL_LABELS.some((label) => line.trim() === label),
  );
  const body = nextLabelOffset === -1 ? rest : rest.slice(0, nextLabelOffset);
  return body.join("\n").trim();
}

// Normalises a value for equality comparison: trim, case-fold, strip a
// leading numeric level prefix ("3 — ", "2 - ", "1: "), then collapse
// underscore/hyphen/whitespace runs to a single space. Makes
// "secondary_research", "Secondary research" and "2 — Secondary research"
// compare equal.
export function normalizeComparisonValue(text: string): string {
  let value = text.trim().toLowerCase();
  value = value.replace(/^\d+\s*(?:—|-|:)\s*/, "");
  value = value.replace(/[\s_-]+/g, " ").trim();
  return value;
}
