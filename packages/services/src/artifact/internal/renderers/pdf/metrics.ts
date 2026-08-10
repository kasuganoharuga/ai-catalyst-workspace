// Pure text measurement from fontkit — no live PDFDocument. buildPlan runs before any PDF exists.
// linePitch matches pdf-lib exactly; guessing (e.g. fontSize * 1.25) caused silent multiline truncation.
import type { Font as FontkitFont } from "fontkit";

/** Matches pdf-lib's `PDFFont.heightAtSize(size)` for a custom-embedded font, without needing one embedded. */
export function heightAtSize(font: FontkitFont, size: number): number {
  const scale = 1000 / font.unitsPerEm;
  const yTop = (font.ascent || font.bbox.maxY) * scale;
  const yBottom = (font.descent || font.bbox.minY) * scale;
  return ((yTop - yBottom) / 1000) * size;
}

/** pdf-lib's actual multiline line-to-line pitch at this font size — see this module's header. Do not hardcode a ratio. */
export function linePitch(font: FontkitFont, size: number): number {
  return heightAtSize(font, size) * 1.2;
}

/** pdf-lib inserts this much top padding before laying out the first line of a multiline field. */
export const FIELD_TOP_PADDING = 1;

/** Sum of glyph advance widths for `text` at `size`, in the same units pdf-lib's `widthOfTextAtSize` returns. */
export function measureTextWidth(
  font: FontkitFont,
  text: string,
  size: number,
): number {
  let total = 0;
  for (const glyphRun of font.layout(text).glyphs) {
    total += ((glyphRun.advanceWidth ?? 0) / font.unitsPerEm) * size;
  }
  return total;
}

/**
 * Greedy word-wrap shared by buildPlan and render() so pagination and drawing
 * never disagree about line breaks.
 */
export function wrapText(
  font: FontkitFont,
  text: string,
  size: number,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter((word) => word.length > 0);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = words[0];
    for (let i = 1; i < words.length; i += 1) {
      const candidate = `${current} ${words[i]}`;
      if (measureTextWidth(font, candidate, size) > maxWidth) {
        lines.push(current);
        current = words[i];
      } else {
        current = candidate;
      }
    }
    lines.push(current);
  }
  return lines;
}

/** How tall a block of `text` will be once wrapped to `maxWidth` at `size` — what buildPlan uses to decide page breaks. */
export function blockHeight(
  font: FontkitFont,
  text: string,
  size: number,
  maxWidth: number,
): number {
  return wrapText(font, text, size, maxWidth).length * linePitch(font, size);
}

/** Characters outside the Latin subset with no NFKD decomposition — arrows, checkmarks, stroked letters. */
// U+0300–U+036F as escapes so editors do not paste raw combining marks into the regex.
const COMBINING_MARK_RANGE = new RegExp("[\\u0300-\\u036f]", "g");

// Prefer readable ASCII — Noto Sans Latin subset has no arrow/checkmark glyphs.
const FONT_COVERAGE_SUBSTITUTIONS: Record<string, string> = {
  "→": " > ",
  "←": " < ",
  "↔": " <-> ",
  "⇒": " => ",
  "⇐": " <= ",
  "✓": "(ok)",
  "✔": "(ok)",
  "✗": "(no)",
  "✘": "(no)",
  ł: "l",
  Ł: "L",
  đ: "d",
  Đ: "D",
  ø: "o",
  Ø: "O",
  ß: "ss",
  æ: "ae",
  Æ: "AE",
  "…": "...",
  // Unicode spaces often lack glyphs in the Latin subset.
  "\u00a0": " ", // NBSP
  "\u202f": " ", // narrow no-break space
  "\u2009": " ", // thin space
  "\u200a": " ", // hair space
  "\u2008": " ", // punctuation space
  "\u2007": " ", // figure space
  "\u2002": " ", // en space
  "\u2003": " ", // em space
};

/**
 * Rewrite uncovered characters before layout/drawing so one bad glyph never
 * fails the whole workbook — explicit substitutions, then NFKD, then "?".
 */
export function sanitizeForFontCoverage(
  font: FontkitFont,
  text: string,
): string {
  let result = "";
  for (const char of text) {
    // Only keep ASCII structural whitespace unchecked; Unicode spaces often lack glyphs.
    if (char === "\n" || char === "\r" || char === "\t" || char === " ") {
      result += char;
      continue;
    }
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined || font.hasGlyphForCodePoint(codePoint)) {
      result += char;
      continue;
    }
    const substituted = FONT_COVERAGE_SUBSTITUTIONS[char];
    if (substituted !== undefined) {
      result += substituted;
      continue;
    }
    const decomposed = char.normalize("NFKD").replace(COMBINING_MARK_RANGE, "");
    const decomposedCovered =
      decomposed.length > 0 &&
      [...decomposed].every((decomposedChar) => {
        const decomposedCodePoint = decomposedChar.codePointAt(0);
        return (
          decomposedCodePoint !== undefined &&
          font.hasGlyphForCodePoint(decomposedCodePoint)
        );
      });
    result += decomposedCovered ? decomposed : "?";
  }
  return result;
}

/**
 * Throws if any character lacks a glyph — custom embedded fonts silently use
 * `.notdef` instead of erroring like StandardFonts.
 */
export function assertFontCoverage(
  font: FontkitFont,
  text: string,
  fieldName: string,
): void {
  const missing = new Set<string>();
  for (const char of text) {
    // Same structural ASCII whitespace carve-out as sanitizeForFontCoverage.
    if (char === "\n" || char === "\r" || char === "\t" || char === " ") {
      continue;
    }
    const codePoint = char.codePointAt(0);
    if (codePoint !== undefined && !font.hasGlyphForCodePoint(codePoint)) {
      missing.add(char);
    }
  }
  if (missing.size > 0) {
    const shown = [...missing]
      .map((char) => {
        const cp = char.codePointAt(0);
        if (cp === undefined) {
          return "?";
        }
        if (char.trim() === "" || cp < 0x20) {
          return `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
        }
        return char;
      })
      .join(" ");
    throw new Error(
      `WORKBOOK_RENDER_FAILED: field "${fieldName}" contains characters outside the embedded font's ` +
        `coverage: ${shown}`,
    );
  }
}
