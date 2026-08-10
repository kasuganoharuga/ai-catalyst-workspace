// Pure Markdown structure helpers shared by structured-markdown-v1 and legacy
// verdict validators. Kept generic enough for multiple callers, but still
// string-in/string-out — no DB or ActorContext, matching the Validator contract.

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

/** Section body under the first matching heading; `null` if missing, empty string if present but blank. */
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

// Exclude `**bold**` labels from the bullet branch; numbered placeholders like "1." still match.
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

// --- Substantive-content detection ---
// Reject unfilled template hints/placeholders so raw toolkit templates never pass validation.
// Angle-bracket spans are always hints — even when embedded inside otherwise-real text.
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

// --- Markdown tables ---
// Several templates are tables, not lists — list helpers cannot see their rows.

/** Split a table row on `|`, honouring escaped `\|` inside cells. */
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

// Strip emphasis markers so comparisons and PDF rendering see plain text, not literal `**`.
export function stripMarkdownEmphasis(text: string): string {
  return text.replace(/\*\*([^*]*)\*\*/g, "$1").replace(/\*([^*]*)\*/g, "$1");
}

function parseTableRowCells(rawLine: string): string[] {
  const trimmed = rawLine.trim();
  const rawCells = tokenizeTableRow(trimmed);
  // Drop empty leading/trailing cells from the frame pipes.
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

/** Parse a table from section body; `null` if not a table, empty rows if scaffold-only. */
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

// Prose outside table scaffolding — so empty `|---|---|` rows are not mistaken for honest-unknown text.
export function extractNonTableProse(sectionBody: string): string {
  return sectionBody
    .split("\n")
    .filter((line) => !isTableLine(line))
    .join("\n")
    .trim();
}

// --- Honest-unknown markers ---
// `orRecordedUnknown` only accepts explicit gap phrasing from the templates, not generic filler.
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

// --- Labels ---

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

/** Value after a `**Label:**` or `- Label:` marker; `null` if absent, empty string if present but blank. */
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

  // Skip blank lines between marker and value block (compact Snapshot cards).
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

// --- Save protocol ---
// Modules 2-4 wrap answers in metadata blocks; rules compare CONFIRMED ANSWER only.
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

// Normalise for equality: case-fold, strip level prefixes, collapse separators.
export function normalizeComparisonValue(text: string): string {
  let value = text.trim().toLowerCase();
  value = value.replace(/^\d+\s*(?:—|-|:)\s*/, "");
  value = value.replace(/[\s_-]+/g, " ").trim();
  return value;
}
