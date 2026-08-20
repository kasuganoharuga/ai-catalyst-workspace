import { describe, expect, it } from "vitest";

import { BOLD_FONTKIT_FONT, REGULAR_FONTKIT_FONT } from "./embed-fonts.js";
import { A4, LayoutBuilder } from "./layout-builder.js";

function builder(bottomReserve = 20): LayoutBuilder {
  return new LayoutBuilder(REGULAR_FONTKIT_FONT, BOLD_FONTKIT_FONT, {
    bottomReserve,
  });
}

describe("LayoutBuilder — page management", () => {
  it("starts with exactly one page", () => {
    const { pages } = builder().toPlanParts();
    expect(pages).toHaveLength(1);
  });

  it("newPage() adds a page and resets the cursor to the top margin", () => {
    const l = builder();
    l.newPage();
    expect(l.toPlanParts().pages).toHaveLength(2);
    expect(l.y).toBe(A4.height - l.margin);
  });

  it("ensure() does not page-break when the content fits", () => {
    const l = builder();
    l.ensure(10);
    expect(l.toPlanParts().pages).toHaveLength(1);
    expect(l.currentPage).toBe(0);
  });

  it("ensure() page-breaks when the content would overflow the bottom reserve", () => {
    const l = builder();
    l.advance(A4.height - l.margin - 25); // leave 25pt above the bottom reserve (20pt)
    l.ensure(50); // 50pt does not fit in 25pt
    expect(l.currentPage).toBe(1);
  });
});

describe("LayoutBuilder — footer labels (regression: overflow pages must inherit the current label)", () => {
  it("a page created before setFooterLabel has a null label", () => {
    const l = builder();
    expect(l.toPlanParts().pages[0].footerLabel).toBeNull();
  });

  it("setFooterLabel retroactively labels the page currently open", () => {
    const l = builder();
    l.setFooterLabel("Section A");
    expect(l.toPlanParts().pages[0].footerLabel).toBe("Section A");
  });

  it("a page created by newPage() after setFooterLabel inherits that label", () => {
    const l = builder();
    l.setFooterLabel("Section A");
    l.newPage();
    expect(l.toPlanParts().pages[1].footerLabel).toBe("Section A");
  });

  it(
    "THE BUG THIS FIXES: a page created by ensure()'s mid-section overflow " +
      "inherits the section's footer label, not null",
    () => {
      const l = builder();
      l.setFooterLabel("Interview 1 · A");
      // Force enough content that ensure() must open a fresh page without an
      // explicit newPage()/setFooterLabel() call at the call site — this is
      // exactly the "footer drawn after a section's content only ever
      // reaches whatever page happens to be current" failure mode: the
      // overflow page must NOT end up with a null or stale label.
      for (let i = 0; i < 100; i += 1) {
        l.lockedText(`filler_${i}`, "filler line", { size: 10 });
      }
      const { pages } = l.toPlanParts();
      expect(pages.length).toBeGreaterThan(1);
      for (const page of pages) {
        expect(page.footerLabel).toBe("Interview 1 · A");
      }
    },
  );

  it("changing the label mid-build only affects pages from that point on", () => {
    const l = builder();
    l.setFooterLabel("A");
    l.newPage();
    l.setFooterLabel("B");
    l.newPage();
    const { pages } = l.toPlanParts();
    expect(pages.map((p) => p.footerLabel)).toEqual(["A", "B", "B"]);
  });
});

describe("LayoutBuilder — locked content", () => {
  it("records role, text, page and position", () => {
    const l = builder();
    l.lockedText("venture_name", "Kerbside", { size: 20, bold: true });
    const { lockedContent } = l.toPlanParts();
    expect(lockedContent).toHaveLength(1);
    expect(lockedContent[0]).toMatchObject({
      role: "venture_name",
      text: "Kerbside",
      page: 0,
      bold: true,
      size: 20,
    });
  });

  it("advances the cursor down by the block's measured height plus gap", () => {
    const l = builder();
    const startY = l.y;
    l.lockedText("q1", "one two three", { size: 10 }, { gap: 5 });
    expect(l.y).toBeLessThan(startY);
  });

  it("page-breaks a block whole rather than splitting it, by default", () => {
    const l = builder();
    l.advance(A4.height - l.margin - 25);
    l.lockedText("q1", "one two three four five", { size: 10 });
    // Should have moved to page 1 entirely, not split across 0 and 1.
    expect(
      l
        .toPlanParts()
        .lockedContent.every(
          (e) => e.page === l.toPlanParts().lockedContent[0].page,
        ),
    ).toBe(true);
  });

  it("allowSplit: true splits a block that spans more than one page", () => {
    const l = builder();
    // Explicit `\n` breaks give a precise, guaranteed line count — far more
    // lines than one A4 page can hold at 10pt, regardless of word-wrap width.
    const longText = Array.from(
      { length: 200 },
      (_, i) => `explicit line ${i}`,
    ).join("\n");
    l.lockedText(
      "long_block",
      longText,
      { size: 10 },
      { allowSplit: true, maxWidth: 500 },
    );
    const { lockedContent } = l.toPlanParts();
    const pagesUsed = new Set(lockedContent.map((e) => e.page));
    expect(pagesUsed.size).toBeGreaterThan(1);
    // No line of the original text should be dropped in the process.
    const recombined = lockedContent.map((e) => e.text).join("\n");
    expect(recombined.split("\n")).toHaveLength(200);
  });

  it("options.y places text at an explicit position without reading or advancing the cursor", () => {
    const l = builder();
    const y = l.y;
    l.lockedText("code", "P1", { size: 8 }, { y: 200 });
    expect(l.toPlanParts().lockedContent[0].y).toBe(200);
    expect(l.y).toBe(y); // cursor untouched
  });
});

describe("LayoutBuilder — fields", () => {
  it("textField records a rect derived from the cursor and advances past it", () => {
    const l = builder();
    const startY = l.y;
    const field = l.textField("interview_1.date_day", {
      width: 40,
      height: 15,
      capacity: 2,
    });
    expect(field).toMatchObject({
      kind: "text",
      name: "interview_1.date_day",
      capacity: 2,
      multiline: false,
    });
    expect(field.rect.y).toBeLessThan(startY);
    expect(l.y).toBeLessThan(startY);
  });

  it("textFieldAt places a field without moving the cursor (for side-by-side layouts)", () => {
    const l = builder();
    const y = l.y;
    l.textFieldAt("a", { x: 0, y: 100, width: 50, height: 15 }, 10);
    expect(l.y).toBe(y);
  });

  it("checkboxAt and dropdownAt record the correct field kinds", () => {
    const l = builder();
    const checkbox = l.checkboxAt("interview_1.pass_bar_1", {
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    const dropdown = l.dropdownAt(
      "experiment_1.outcome",
      { x: 0, y: 0, width: 100, height: 15 },
      ["Pass", "Fail"],
    );
    expect(checkbox.kind).toBe("checkbox");
    expect(dropdown).toMatchObject({
      kind: "dropdown",
      options: ["Pass", "Fail"],
    });
  });

  it("multiple fields accumulate in order", () => {
    const l = builder();
    l.textField("a", { width: 10, height: 10, capacity: 5 });
    l.textField("b", { width: 10, height: 10, capacity: 5 });
    expect(l.toPlanParts().fields.map((f) => f.name)).toEqual(["a", "b"]);
  });
});
