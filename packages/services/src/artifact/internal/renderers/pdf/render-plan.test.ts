import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { PROVENANCE_INFO_KEYS, type Provenance, type WorkbookRenderPlan } from "../types.js";
import { renderWorkbookPlan } from "./render-plan.js";

const PROVENANCE: Provenance = {
  sourceArtifactId: "artifact-123",
  sourceArtifactVersion: 3,
  sourceContentHash: "sha256:deadbeef",
  rendererKey: "test_workbook_v1",
  rendererVersion: "1",
  generatedAt: "2026-08-07T00:00:00.000Z",
  workspaceId: "workspace-456",
  programRunId: "run-789",
  programVersionNumber: 7,
};

/** A minimal but structurally complete plan: two pages, one of each field kind, locked content on both pages. */
function samplePlan(overrides: Partial<WorkbookRenderPlan> = {}): WorkbookRenderPlan {
  return {
    pages: [{ footerLabel: "Page one" }, { footerLabel: "Page two" }],
    fields: [
      { kind: "text", name: "interview_1.date_day", page: 0, rect: { x: 40, y: 700, width: 40, height: 15 }, multiline: false, capacity: 2 },
      { kind: "text", name: "interview_1.notes", page: 0, rect: { x: 40, y: 600, width: 400, height: 60 }, multiline: true, capacity: 200 },
      { kind: "checkbox", name: "interview_1.pass_bar_1", page: 1, rect: { x: 40, y: 700, width: 10, height: 10 } },
      { kind: "dropdown", name: "experiment_1.outcome", page: 1, rect: { x: 40, y: 650, width: 100, height: 15 }, options: ["Pass", "Fail", "Inconclusive"] },
    ],
    lockedContent: [
      { role: "venture_name", text: "Kerbside", page: 0, x: 40, y: 800, maxWidth: 400, size: 20, bold: true },
      { role: "question_1", text: "Tell me about the last time this happened.", page: 0, x: 40, y: 750, maxWidth: 400, size: 10, bold: false },
      { role: "pass_bar_condition_1", text: "Named a cost in time or money.", page: 1, x: 60, y: 700, maxWidth: 300, size: 9, bold: false },
    ],
    provenance: PROVENANCE,
    ...overrides,
  };
}

async function extractPageText(bytes: Buffer, pageNumber: number): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  return content.items
    .map((item) => ("str" in item ? item.str : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

describe("renderWorkbookPlan — structure", () => {
  it("produces one PDF page per plan page", async () => {
    const bytes = await renderWorkbookPlan(samplePlan());
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
  });

  it("creates exactly the fields the plan specifies, each with one widget, no unexpected fields", async () => {
    const bytes = await renderWorkbookPlan(samplePlan());
    const doc = await PDFDocument.load(bytes);
    const fields = doc.getForm().getFields();
    const names = fields.map((f) => f.getName()).sort();
    expect(names).toEqual(
      ["experiment_1.outcome", "interview_1.date_day", "interview_1.notes", "interview_1.pass_bar_1"].sort(),
    );
    for (const field of fields) {
      expect(field.acroField.getWidgets()).toHaveLength(1);
    }
  });

  it("dot-separated field names are enumerated correctly via form.getFields() (not the raw AcroForm /Fields array, which collapses siblings)", async () => {
    const plan = samplePlan({
      fields: [
        { kind: "text", name: "interview_1.date_day", page: 0, rect: { x: 40, y: 700, width: 40, height: 15 }, multiline: false, capacity: 2 },
        { kind: "text", name: "interview_1.date_month", page: 0, rect: { x: 90, y: 700, width: 40, height: 15 }, multiline: false, capacity: 2 },
      ],
    });
    const bytes = await renderWorkbookPlan(plan);
    const doc = await PDFDocument.load(bytes);
    const names = doc.getForm().getFields().map((f) => f.getName());
    expect(names.sort()).toEqual(["interview_1.date_day", "interview_1.date_month"]);
  });

  it("embeds exactly the two intentional fonts, plus pdf-lib's Helvetica checkbox-appearance dependency", async () => {
    // pdf-lib auto-derives each embedded font's /BaseFont from the font
    // file's own internal name plus a random suffix (e.g. "NotoSans-5824") —
    // independent of the "/DR" resource key ("WorkbookSans") chosen in
    // embed-fonts.ts, which is a separate identifier. This asserts no
    // *other*, unintended font dependency crept in (plan §7 finding 7:
    // pdf-lib's default checkbox appearance silently pulls in /Helvetica).
    const bytes = await renderWorkbookPlan(samplePlan());
    const doc = await PDFDocument.load(bytes);
    const baseFonts = new Set<string>();
    for (const [, obj] of doc.context.enumerateIndirectObjects()) {
      const dict = obj instanceof PDFDict ? obj : undefined;
      const baseFont = dict?.get(PDFName.of("BaseFont"));
      if (baseFont) baseFonts.add(baseFont.toString());
    }
    expect(baseFonts.size).toBeGreaterThan(0);
    for (const font of baseFonts) {
      const isHelvetica = font === "/Helvetica";
      const isEmbeddedNotoSans = /^\/NotoSans(-Bold)?-\d+$/.test(font);
      expect(isHelvetica || isEmbeddedNotoSans, `unexpected embedded font: ${font}`).toBe(true);
    }
  });

  it("wires /DR with both embedded fonts and an AcroForm-level /DA", async () => {
    const bytes = await renderWorkbookPlan(samplePlan());
    const doc = await PDFDocument.load(bytes);
    const acroForm = doc.context.lookup(doc.catalog.get(PDFName.of("AcroForm")), PDFDict);
    const dr = doc.context.lookup(acroForm.get(PDFName.of("DR")), PDFDict);
    const drFonts = doc.context.lookup(dr.get(PDFName.of("Font")), PDFDict);
    expect(drFonts.keys().map((k) => k.asString())).toEqual(
      expect.arrayContaining(["/WorkbookSans", "/WorkbookSansBold"]),
    );
    expect(acroForm.get(PDFName.of("DA"))).toBeDefined();
  });
});

describe("renderWorkbookPlan — provenance", () => {
  it("stamps all nine provenance keys with the correct values", async () => {
    const bytes = await renderWorkbookPlan(samplePlan());
    const doc = await PDFDocument.load(bytes);
    const info = doc.context.lookup(doc.context.trailerInfo.Info, PDFDict);
    expect(PROVENANCE_INFO_KEYS).toHaveLength(9);
    for (const key of PROVENANCE_INFO_KEYS) {
      expect(info.get(PDFName.of(key))).toBeDefined();
    }
    expect(info.get(PDFName.of("SourceArtifactId"))?.toString()).toContain("artifact-123");
    expect(info.get(PDFName.of("ProgramVersionNumber"))?.toString()).toContain("7");
  });
});

describe("renderWorkbookPlan — drawn content and footers", () => {
  it("draws locked content on its assigned page", async () => {
    const bytes = await renderWorkbookPlan(samplePlan());
    const page0Text = await extractPageText(bytes, 1);
    const page1Text = await extractPageText(bytes, 2);
    expect(page0Text).toContain("Kerbside");
    expect(page0Text).toContain("Tell me about the last time this happened.");
    expect(page1Text).toContain("Named a cost in time or money.");
  });

  it("draws a footer with the page-specific label on every page", async () => {
    const bytes = await renderWorkbookPlan(samplePlan());
    const page0Text = await extractPageText(bytes, 1);
    const page1Text = await extractPageText(bytes, 2);
    expect(page0Text).toContain("Page one");
    expect(page1Text).toContain("Page two");
  });

  it("draws the fixed provenance line on every page, independent of the per-page label", async () => {
    const bytes = await renderWorkbookPlan(samplePlan());
    const page0Text = await extractPageText(bytes, 1);
    const page1Text = await extractPageText(bytes, 2);
    for (const text of [page0Text, page1Text]) {
      expect(text).toContain("test_workbook_v1");
      expect(text).toContain("Artifact version 3");
      expect(text).toContain("Program v7");
    }
  });

  it("a page with a null footerLabel still carries the fixed provenance line", async () => {
    const plan = samplePlan({ pages: [{ footerLabel: null }, { footerLabel: null }] });
    const bytes = await renderWorkbookPlan(plan);
    const page0Text = await extractPageText(bytes, 1);
    expect(page0Text).toContain("test_workbook_v1");
  });

  it("extracts text with byte-correct characters — the WOFF2-vs-TTF regression this font module exists to prevent", async () => {
    const plan = samplePlan({
      lockedContent: [
        { role: "venture_name", text: "Problem-Interview-Guide.md", page: 0, x: 40, y: 800, maxWidth: 400, size: 12, bold: false },
      ],
    });
    const bytes = await renderWorkbookPlan(plan);
    const text = await extractPageText(bytes, 1);
    // The historical failure mode (raw WOFF2 embedded without decompression)
    // extracted this exact string as "Probl)m-I2t)rvi)w-G9id).md" — glyphs
    // drew correctly but the ToUnicode CMap was wrong. Assert the real
    // string is present, not a mis-mapped lookalike.
    expect(text).toContain("Problem-Interview-Guide.md");
  });
});

describe("renderWorkbookPlan — round-trip", () => {
  it("a text field filled after generation reads back exactly what was written", async () => {
    const bytes = await renderWorkbookPlan(samplePlan());
    const doc = await PDFDocument.load(bytes);
    const field = doc.getForm().getTextField("interview_1.notes");
    field.setText("They rebuild the spreadsheet every Friday — “painful”, they said.");
    const saved = await doc.save();

    const reopened = await PDFDocument.load(saved);
    expect(reopened.getForm().getTextField("interview_1.notes").getText()).toBe(
      "They rebuild the spreadsheet every Friday — “painful”, they said.",
    );
  });

  it("a checkbox toggled after generation reads back correctly", async () => {
    const bytes = await renderWorkbookPlan(samplePlan());
    const doc = await PDFDocument.load(bytes);
    doc.getForm().getCheckBox("interview_1.pass_bar_1").check();
    const saved = await doc.save();

    const reopened = await PDFDocument.load(saved);
    expect(reopened.getForm().getCheckBox("interview_1.pass_bar_1").isChecked()).toBe(true);
  });

  it("a dropdown selection after generation reads back correctly", async () => {
    const bytes = await renderWorkbookPlan(samplePlan());
    const doc = await PDFDocument.load(bytes);
    doc.getForm().getDropdown("experiment_1.outcome").select("Fail");
    const saved = await doc.save();

    const reopened = await PDFDocument.load(saved);
    expect(reopened.getForm().getDropdown("experiment_1.outcome").getSelected()).toEqual(["Fail"]);
  });

  it("respects the field's max length", async () => {
    const bytes = await renderWorkbookPlan(samplePlan());
    const doc = await PDFDocument.load(bytes);
    expect(doc.getForm().getTextField("interview_1.date_day").getMaxLength()).toBe(2);
  });
});

describe("renderWorkbookPlan — font coverage failures fail before any bytes are produced", () => {
  it("throws WORKBOOK_RENDER_FAILED for locked content outside font coverage, naming the field", async () => {
    const plan = samplePlan({
      lockedContent: [{ role: "venture_name", text: "中文客户名称", page: 0, x: 40, y: 800, maxWidth: 400, size: 12, bold: false }],
    });
    await expect(renderWorkbookPlan(plan)).rejects.toThrow(/WORKBOOK_RENDER_FAILED.*venture_name/);
  });

  it("throws for an uncovered dropdown option", async () => {
    const plan = samplePlan({
      fields: [
        { kind: "dropdown", name: "experiment_1.outcome", page: 0, rect: { x: 40, y: 700, width: 100, height: 15 }, options: ["中文"] },
      ],
    });
    await expect(renderWorkbookPlan(plan)).rejects.toThrow(/WORKBOOK_RENDER_FAILED/);
  });

  it("throws for an uncovered footer label", async () => {
    const plan = samplePlan({ pages: [{ footerLabel: "中文" }, { footerLabel: null }] });
    await expect(renderWorkbookPlan(plan)).rejects.toThrow(/WORKBOOK_RENDER_FAILED/);
  });
});
