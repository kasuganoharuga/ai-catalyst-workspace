// Markdown structure helpers used only by
// validators/pressure-test-verdict-v1.ts — deliberately not shared with
// any other Validator (a future Validator's template has a different
// heading/label vocabulary; forcing a shared "generic Markdown artifact
// parser" abstraction now would just be premature generalization for a
// single caller). Every function here is pure and takes plain strings —
// no DB/Storage/ActorContext involvement, matching the Validator
// contract's own "synchronous pure function" requirement.

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
      result.push({ level: match[1].length, heading: match[2].trim(), lineIndex });
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
export function getSection(content: string, level: number, headingText: string): string | null {
  const lines = content.split("\n");
  const headings = parseHeadingLines(lines);
  const target = headings.find(
    (heading) =>
      heading.level === level && heading.heading.toLowerCase() === headingText.toLowerCase(),
  );
  if (!target) {
    return null;
  }
  const nextHeadingIndex = headings.findIndex(
    (heading) => heading.lineIndex > target.lineIndex && heading.level <= level,
  );
  const endLine = nextHeadingIndex === -1 ? lines.length : headings[nextHeadingIndex].lineIndex;
  return lines.slice(target.lineIndex + 1, endLine).join("\n").trim();
}

export function sectionExists(content: string, level: number, headingText: string): boolean {
  return getSection(content, level, headingText) !== null;
}

export function isSectionNonEmpty(content: string, level: number, headingText: string): boolean {
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Finds an inline `**Label:**` marker anywhere in `content` and returns
 * the text that follows it: inline text on the same line if present,
 * otherwise the following paragraph (collected until a blank line, the
 * next heading, or another `**Label:**` marker). `null` when the marker
 * itself is entirely absent — distinct from an empty string, which means
 * the marker is present but nothing follows it yet.
 */
export function extractLabelValue(content: string, label: string): string | null {
  const lines = content.split("\n");
  const markerPattern = new RegExp(`^\\s*\\*\\*${escapeRegExp(label)}:\\*\\*\\s*(.*)$`, "i");

  const markerIndex = lines.findIndex((line) => markerPattern.test(line));
  if (markerIndex === -1) {
    return null;
  }

  const inline = markerPattern.exec(lines[markerIndex])?.[1]?.trim() ?? "";
  if (inline.length > 0) {
    return inline;
  }

  const collected: string[] = [];
  for (let i = markerIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim().length === 0) {
      break;
    }
    if (/^#{1,6}\s/.test(line) || /^\s*\*\*[^*]+:\*\*/.test(line)) {
      break;
    }
    collected.push(line.trim());
  }
  return collected.join(" ").trim();
}
