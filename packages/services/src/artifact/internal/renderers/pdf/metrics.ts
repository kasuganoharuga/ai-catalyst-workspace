// Pure text-measurement functions, computed directly from a fontkit-parsed
// font object — deliberately with NO dependency on a live pdf-lib
// PDFDocument or embedded PDFFont. buildPlan() runs before any PDF exists
// (see ../types.ts), so pagination decisions must be computable from font
// metrics alone.
//
// `linePitch` reimplements pdf-lib's own multiline layout arithmetic
// exactly — see the header comment for why guessing this number is
// dangerous: an earlier pass assumed `fontSize * 1.25` (11.25pt at 9pt),
// which is 31% smaller than pdf-lib's real 14.708pt and would have let a
// Founder type ~30% more than a field can actually display, i.e. silent
// truncation on print. Reverse-engineered from
// pdf-lib's CustomFontEmbedder.heightOfFontAtSize and
// layoutMultilineText (`lineHeight = height + height * 0.2`), and verified
// byte-for-byte against pdf-lib's own generated appearance streams: filling
// a real multiline field and reading back its `Tm` operators produced
// baselines matching this formula to within 0.002pt.
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
 * Greedy word-wrap identical in spirit to pdf-lib's own line splitting:
 * a run of non-whitespace never splits mid-word. Honours explicit `\n`
 * paragraph breaks. Both buildPlan (to decide how many lines a block will
 * take, for pagination) and render() (to actually draw the lines) call this
 * same function, so the two can never disagree about a wrap point.
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

/**
 * Characters common in AI-generated or founder-typed prose that fall
 * outside the embedded Latin subset's coverage but have no clean Unicode
 * decomposition — a stroke through a letter, an arrow, a checkmark — so
 * NFKD normalisation below can't recover them.
 */
// Combining Diacritical Marks block (U+0300-U+036F) — written as escapes,
// not literal characters, so the source stays readable in an editor and
// a future edit here can't silently paste a raw combining mark instead of
// the two-character regex range it looks like.
const COMBINING_MARK_RANGE = new RegExp("[\\u0300-\\u036f]", "g");

// Prefer human-readable ASCII over serialization-looking tokens
// ("->", "[done]") — Noto Sans Latin subset has no arrow/checkmark glyphs,
// but " > " / "(ok)" still read as prose in a printed workbook.
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
};

/**
 * Best-effort rewrite of `text` so every character has a glyph in `font`,
 * applied before any layout/measurement or drawing happens. A single
 * character outside the embedded font's coverage must never fail the
 * whole workbook render — this is the point that guarantees it doesn't.
 *
 * Order: (1) the explicit table above, for characters with no usable
 * decomposition; (2) NFKD-normalise and strip combining diacritical marks
 * for anything still uncovered (é -> e, ü -> u, ...); (3) fall back to "?"
 * for anything neither step recovers (CJK, Cyrillic, Greek, emoji) rather
 * than let `assertFontCoverage` below throw over content a Founder typed
 * in good faith.
 */
export function sanitizeForFontCoverage(
  font: FontkitFont,
  text: string,
): string {
  let result = "";
  for (const char of text) {
    // Whitespace and control characters (notably "\n" and "\t") are
    // structural, not drawn glyphs — wrapText splits on them before any
    // text reaches the font at all, and several have no glyph in this (or
    // any) font's cmap despite being perfectly fine to carry through.
    // Coverage-checking them would rewrite "\n" to "?" and silently
    // collapse a multi-paragraph field onto one line.
    if (/\s/.test(char)) {
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
 * Every codepoint in `text` must have a glyph in `font`, or this throws.
 * Custom embedded fonts do NOT throw on an uncovered character the way
 * pdf-lib's StandardFonts do — they silently fall back to `.notdef` (a
 * blank glyph), confirmed by drawing an uncovered CJK string and observing
 * `widthOfTextAtSize` return a width with no error at all. Coverage must
 * therefore be checked explicitly, per character, before anything is drawn.
 */
export function assertFontCoverage(
  font: FontkitFont,
  text: string,
  fieldName: string,
): void {
  const missing = new Set<string>();
  for (const char of text) {
    const codePoint = char.codePointAt(0);
    if (codePoint !== undefined && !font.hasGlyphForCodePoint(codePoint)) {
      missing.add(char);
    }
  }
  if (missing.size > 0) {
    throw new Error(
      `WORKBOOK_RENDER_FAILED: field "${fieldName}" contains characters outside the embedded font's ` +
        `coverage: ${[...missing].join(" ")}`,
    );
  }
}
