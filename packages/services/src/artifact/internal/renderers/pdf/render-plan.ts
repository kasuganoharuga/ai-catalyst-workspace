// --- Workbook plan emitter ---
// Replays a pre-computed WorkbookRenderPlan onto pdf-lib — no layout here,
// only draw at absolute positions with the same wrapText buildPlan used.
import {
  PDFDict,
  PDFDocument,
  PDFName,
  PDFString,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

import { PROVENANCE_INFO_KEYS } from "@ai-catalyst/services/artifact/internal/renderers/types";
import {
  assertFontCoverage,
  linePitch,
  wrapText,
} from "@ai-catalyst/services/artifact/internal/renderers/pdf/metrics";
import {
  BOLD_FONTKIT_FONT,
  embedWorkbookFonts,
  REGULAR_FONTKIT_FONT,
} from "@ai-catalyst/services/artifact/internal/renderers/pdf/embed-fonts";
// Same page-size and margin source LayoutBuilder computes pagination
// against — a buildPlan() that positioned content for A4 at one margin and
// a render step that created pages or a footer at different values would
// silently misplace everything.
import {
  A4,
  DEFAULT_MARGIN,
} from "@ai-catalyst/services/artifact/internal/renderers/pdf/layout-builder";
import type { FieldPlan, WorkbookRenderPlan } from "../types.js";

const FOOTER_Y = 22;
const FOOTER_SIZE = 7;
const FOOTER_COLOR = rgb(0.45, 0.45, 0.5);
const BODY_COLOR = rgb(0.1, 0.1, 0.12);
const FIELD_BG = rgb(0.972, 0.974, 0.98);
const FIELD_BORDER = rgb(0.72, 0.72, 0.78);
const FIELD_TEXT_SIZE = 9;

/**
 * Visible footer left line — product + workbook title only. Technical
 * provenance (renderer key, artifact version, timestamps) lives in the PDF
 * Info dictionary via `stampProvenanceInfoDict`, not in the printed chrome.
 */
function visibleFooterLeft(
  plan: WorkbookRenderPlan,
  pageIndex: number,
): string {
  const label = plan.pages[pageIndex]?.footerLabel;
  return label ? `AI Catalyst · ${label}` : "AI Catalyst";
}

function visibleFooterRight(pageIndex: number, pageCount: number): string {
  return `Page ${pageIndex + 1} of ${pageCount}`;
}

function assertAllContentWithinCoverage(plan: WorkbookRenderPlan): void {
  for (const entry of plan.lockedContent) {
    assertFontCoverage(
      entry.bold ? BOLD_FONTKIT_FONT : REGULAR_FONTKIT_FONT,
      entry.text,
      entry.role,
    );
  }
  for (const label of plan.pages
    .map((p) => p.footerLabel)
    .filter((l): l is string => l !== null)) {
    assertFontCoverage(REGULAR_FONTKIT_FONT, label, "page footer label");
  }
  // Only pages that opt into a footer label get printed chrome — document
  // exports (e.g. Ideal Customer Avatar) leave footerLabel null and match
  // the handout examples with a clean bottom edge.
  for (let i = 0; i < plan.pages.length; i += 1) {
    if (plan.pages[i]?.footerLabel === null) {
      continue;
    }
    assertFontCoverage(
      REGULAR_FONTKIT_FONT,
      visibleFooterLeft(plan, i),
      "footer left",
    );
    assertFontCoverage(
      REGULAR_FONTKIT_FONT,
      visibleFooterRight(i, plan.pages.length),
      "footer right",
    );
  }
  for (const field of plan.fields) {
    if (field.kind === "dropdown") {
      for (const option of field.options) {
        assertFontCoverage(
          REGULAR_FONTKIT_FONT,
          option,
          `${field.name} option "${option}"`,
        );
      }
    }
  }
}

function drawField(
  page: PDFPage,
  form: ReturnType<PDFDocument["getForm"]>,
  field: FieldPlan,
  fonts: { regular: PDFFont; bold: PDFFont },
): void {
  if (field.kind === "text") {
    const textField = form.createTextField(field.name);
    if (field.multiline) {
      textField.enableMultiline();
    }
    textField.setMaxLength(field.capacity);
    page.drawRectangle({
      ...field.rect,
      color: FIELD_BG,
      borderColor: FIELD_BORDER,
      borderWidth: 0.5,
    });
    // addToPage first: setFontSize writes into the widget's /DA, which does
    // not exist until the widget itself does — calling it first throws
    // MissingDAEntryError.
    textField.addToPage(page, {
      ...field.rect,
      font: fonts.regular,
      borderWidth: 0,
    });
    textField.setFontSize(FIELD_TEXT_SIZE);
    textField.updateAppearances(fonts.regular);
  } else if (field.kind === "checkbox") {
    const checkbox = form.createCheckBox(field.name);
    // Visible square border so Pass/Kill ticks read as checkboxes, not bare codes.
    checkbox.addToPage(page, { ...field.rect, borderWidth: 1.2 });
  } else {
    const dropdown = form.createDropdown(field.name);
    dropdown.setOptions(field.options);
    dropdown.addToPage(page, { ...field.rect, font: fonts.regular });
    dropdown.updateAppearances(fonts.regular);
  }
}

function stampFooters(
  pages: PDFPage[],
  plan: WorkbookRenderPlan,
  font: PDFFont,
): void {
  pages.forEach((page, index) => {
    if (plan.pages[index]?.footerLabel === null) {
      return;
    }
    const left = visibleFooterLeft(plan, index);
    const right = visibleFooterRight(index, pages.length);
    page.drawText(left, {
      x: DEFAULT_MARGIN,
      y: FOOTER_Y,
      size: FOOTER_SIZE,
      font,
      color: FOOTER_COLOR,
    });
    const rightWidth = font.widthOfTextAtSize(right, FOOTER_SIZE);
    page.drawText(right, {
      x: A4.width - DEFAULT_MARGIN - rightWidth,
      y: FOOTER_Y,
      size: FOOTER_SIZE,
      font,
      color: FOOTER_COLOR,
    });
  });
}

function stampProvenanceInfoDict(
  doc: PDFDocument,
  plan: WorkbookRenderPlan,
): void {
  const { provenance } = plan;
  const values: Record<(typeof PROVENANCE_INFO_KEYS)[number], string> = {
    SourceArtifactId: provenance.sourceArtifactId,
    SourceArtifactVersion: String(provenance.sourceArtifactVersion),
    SourceContentHash: provenance.sourceContentHash,
    RendererKey: provenance.rendererKey,
    RendererVersion: provenance.rendererVersion,
    GeneratedAt: provenance.generatedAt,
    WorkspaceId: provenance.workspaceId,
    ProgramRunId: provenance.programRunId,
    ProgramVersionNumber: String(provenance.programVersionNumber),
  };
  // `PDFDocument.getInfoDict()` would do this lazily, but it's declared
  // `private` in pdf-lib's public .d.ts (an intentional type-surface
  // restriction, not a runtime one — same category of thing as `font.ref`
  // above). `setTitle` is the public entry point that creates the Info
  // dictionary internally, so the caller must set the title before calling
  // this function; `context.lookup` then retrieves the now-guaranteed-to-
  // exist dict through the fully public/typed API.
  const infoRef = doc.context.trailerInfo.Info;
  if (!infoRef) {
    throw new Error(
      "WORKBOOK_RENDER_FAILED: no Info dictionary — call doc.setTitle() before stampProvenanceInfoDict.",
    );
  }
  const info = doc.context.lookup(infoRef, PDFDict);
  for (const key of PROVENANCE_INFO_KEYS) {
    info.set(PDFName.of(key), PDFString.of(values[key]));
  }
}

/**
 * Turns a WorkbookRenderPlan into PDF bytes. Throws `Error` (message
 * prefixed `WORKBOOK_RENDER_FAILED:`) if any drawn or field-option string
 * falls outside the embedded font's coverage — checked before any drawing
 * happens, so a failure never produces a partial file.
 */
export async function renderWorkbookPlan(
  plan: WorkbookRenderPlan,
): Promise<Buffer> {
  assertAllContentWithinCoverage(plan);

  const doc = await PDFDocument.create();
  // getForm() must run first — it lazily creates the AcroForm dictionary,
  // which embedWorkbookFonts needs to already exist so it can wire /DR/DA
  // into it.
  const form = doc.getForm();
  const fonts = await embedWorkbookFonts(doc);

  const pageCount = Math.max(plan.pages.length, 1);
  const pdfPages: PDFPage[] = [];
  for (let i = 0; i < pageCount; i += 1) {
    pdfPages.push(doc.addPage([A4.width, A4.height]));
  }

  // Drawn before locked content and fields on every page, so background
  // bands/cards never paint over the text or widgets that sit on top of
  // them.
  for (const fill of plan.rects) {
    pdfPages[fill.page].drawRectangle({
      ...fill.rect,
      color: rgb(fill.color.r, fill.color.g, fill.color.b),
    });
  }

  for (const entry of plan.lockedContent) {
    const page = pdfPages[entry.page];
    const font = entry.bold ? fonts.bold : fonts.regular;
    const fontkitFont = entry.bold ? BOLD_FONTKIT_FONT : REGULAR_FONTKIT_FONT;
    const lines = wrapText(fontkitFont, entry.text, entry.size, entry.maxWidth);
    const pitch = linePitch(fontkitFont, entry.size);
    const color = entry.color
      ? rgb(entry.color.r, entry.color.g, entry.color.b)
      : BODY_COLOR;
    let y = entry.y;
    for (const line of lines) {
      page.drawText(line, {
        x: entry.x,
        y: y - entry.size,
        size: entry.size,
        font,
        color,
      });
      y -= pitch;
    }
  }

  for (const field of plan.fields) {
    drawField(pdfPages[field.page], form, field, fonts);
  }

  stampFooters(pdfPages, plan, fonts.regular);
  // Must run before stampProvenanceInfoDict — see that function's comment
  // on why setTitle is what creates the Info dictionary in the first place.
  doc.setTitle(
    `${plan.provenance.rendererKey} — generated ${plan.provenance.generatedAt}`,
  );
  stampProvenanceInfoDict(doc, plan);

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
