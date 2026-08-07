import { describe, expect, it } from "vitest";

import { REGULAR_FONTKIT_FONT } from "./embed-fonts.js";
import {
  assertFontCoverage,
  blockHeight,
  heightAtSize,
  linePitch,
  measureTextWidth,
  wrapText,
} from "./metrics.js";

const FONT = REGULAR_FONTKIT_FONT;

describe("linePitch", () => {
  // Regression test for the bug this module's header describes: an earlier
  // pass assumed `fontSize * 1.25` (11.25pt at 9pt), which is 31% smaller
  // than pdf-lib's real behaviour and overstated every multiline capacity
  // derived against it. These exact values were measured directly from
  // pdf-lib's own generated appearance-stream Tm operators.
  it.each([
    [8, 13.0734],
    [9, 14.7076],
    [10, 16.3418],
  ])(
    "matches pdf-lib's real multiline pitch at %spt (%spt)",
    (size, expected) => {
      expect(linePitch(FONT, size)).toBeCloseTo(expected, 3);
    },
  );

  it("is NOT fontSize * 1.25 — the bug this formula replaced", () => {
    const wrongAssumption = 9 * 1.25;
    expect(linePitch(FONT, 9)).not.toBeCloseTo(wrongAssumption, 1);
  });

  it("scales linearly with heightAtSize", () => {
    expect(linePitch(FONT, 9)).toBeCloseTo(heightAtSize(FONT, 9) * 1.2, 6);
  });
});

describe("measureTextWidth", () => {
  it("returns 0 for an empty string", () => {
    expect(measureTextWidth(FONT, "", 10)).toBe(0);
  });

  it("is monotonically increasing with more text", () => {
    const short = measureTextWidth(FONT, "The", 10);
    const long = measureTextWidth(FONT, "The quick brown fox", 10);
    expect(long).toBeGreaterThan(short);
  });

  it("scales linearly with font size", () => {
    const at10 = measureTextWidth(FONT, "sample text", 10);
    const at20 = measureTextWidth(FONT, "sample text", 20);
    expect(at20).toBeCloseTo(at10 * 2, 3);
  });

  it("handles smart quotes, em dashes and currency without throwing", () => {
    expect(() =>
      measureTextWidth(FONT, "“smart quotes” — em dash — A$ € £ é ü ñ Å", 10),
    ).not.toThrow();
  });
});

describe("wrapText", () => {
  it("does not wrap text that fits on one line", () => {
    expect(wrapText(FONT, "short line", 10, 500)).toEqual(["short line"]);
  });

  it("wraps at word boundaries, never mid-word", () => {
    const lines = wrapText(
      FONT,
      "one two three four five six seven eight",
      10,
      60,
    );
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(line.trim()).not.toBe("");
      // Every line must be a substring of the original word sequence — no
      // word was split.
      expect("one two three four five six seven eight").toContain(line.trim());
    }
  });

  it("honours explicit paragraph breaks", () => {
    const lines = wrapText(FONT, "first\nsecond", 10, 500);
    expect(lines).toEqual(["first", "second"]);
  });

  it("preserves an empty paragraph as a blank line", () => {
    const lines = wrapText(FONT, "first\n\nthird", 10, 500);
    expect(lines).toEqual(["first", "", "third"]);
  });

  it("wrapping the same text twice is deterministic (buildPlan and render must agree)", () => {
    const text =
      "A long sentence that will need to wrap across several lines for this test.";
    expect(wrapText(FONT, text, 9, 150)).toEqual(wrapText(FONT, text, 9, 150));
  });
});

describe("blockHeight", () => {
  it("equals line count times linePitch", () => {
    const text = "one two three four five six seven eight";
    const size = 10;
    const maxWidth = 60;
    const lines = wrapText(FONT, text, size, maxWidth);
    expect(blockHeight(FONT, text, size, maxWidth)).toBeCloseTo(
      lines.length * linePitch(FONT, size),
      6,
    );
  });
});

describe("assertFontCoverage", () => {
  it("does not throw for the confirmed Latin/punctuation coverage set", () => {
    expect(() =>
      assertFontCoverage(
        FONT,
        "é ü ñ Å “smart quotes” – — en/em dash A$ € £",
        "test_field",
      ),
    ).not.toThrow();
  });

  it("throws, naming the field, for characters outside coverage", () => {
    expect(() =>
      assertFontCoverage(FONT, "中文客户名称", "venture_name"),
    ).toThrow(/WORKBOOK_RENDER_FAILED.*venture_name/);
  });

  it("throws for a single uncovered character mixed into otherwise-covered text", () => {
    expect(() =>
      assertFontCoverage(FONT, "Kerbside 中", "venture_name"),
    ).toThrow(/WORKBOOK_RENDER_FAILED/);
  });
});
