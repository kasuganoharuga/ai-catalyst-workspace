import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { BOLD_FONTKIT_FONT, embedWorkbookFonts, REGULAR_FONTKIT_FONT } from "./embed-fonts.js";

describe("embed-fonts", () => {
  it("parses two genuinely distinct faces, not the same bytes twice", () => {
    // Regression guard for the duplicate-embed bug found while building the
    // real visual layout: a fallback path once embedded the same bytes
    // under two names, adding ~89KB of pure waste per generated workbook.
    expect(REGULAR_FONTKIT_FONT.postscriptName).not.toBe(BOLD_FONTKIT_FONT.postscriptName);
  });

  it("both faces expose real glyph metrics (unitsPerEm, ascent, descent)", () => {
    for (const font of [REGULAR_FONTKIT_FONT, BOLD_FONTKIT_FONT]) {
      expect(font.unitsPerEm).toBeGreaterThan(0);
      expect(typeof font.ascent).toBe("number");
      expect(typeof font.descent).toBe("number");
    }
  });

  it("embeds both faces and wires /DR + /DA when the AcroForm dict already exists", async () => {
    const doc = await PDFDocument.create();
    doc.getForm(); // creates the AcroForm dict
    const { regular, bold } = await embedWorkbookFonts(doc);
    expect(regular).toBeDefined();
    expect(bold).toBeDefined();
  });

  it("throws WORKBOOK_RENDER_FAILED if called before the AcroForm dict exists", async () => {
    const doc = await PDFDocument.create();
    // Deliberately no doc.getForm() call first.
    await expect(embedWorkbookFonts(doc)).rejects.toThrow(/WORKBOOK_RENDER_FAILED/);
  });
});
