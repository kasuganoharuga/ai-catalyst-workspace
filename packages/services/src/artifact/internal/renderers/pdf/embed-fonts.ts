// Embeds the two committed font faces (regular, bold) into a live pdf-lib
// PDFDocument, and wires the AcroForm-level default resources (/DR) and
// default appearance (/DA) that AcroForm fields need. This is emission-time
// work — it runs once per render(), against a real PDFDocument — unlike
// pdf/metrics.ts's coverage/measurement functions, which run at plan-build
// time against a bare fontkit font with no PDFDocument involved.
//
// Both faces are pre-decompressed TTF (see the generated fonts/*.ts modules
// and scripts/generate-workbook-fonts.mjs for why: embedding raw WOFF2 bytes
// produces a corrupt ToUnicode CMap — glyphs draw correctly but text
// extraction reads back the wrong characters).
import fontkit from "@pdf-lib/fontkit";
// `fontkit`'s real ESM build (dist/module.mjs) exports `create` as a NAMED
// export with no default — a plain `import fontkitCore from "fontkit"`
// resolves at compile time (its .d.ts declares a default, written for the
// CJS interop shape) but fails at runtime under a real ESM loader (Vitest,
// Node with `type: module`), since there is nothing to synthesise a default
// from. Import the function by name instead.
import { create as createFontkitFont, type Font as FontkitFont } from "fontkit";
import { PDFDict, PDFDocument, PDFName, PDFString, type PDFFont } from "pdf-lib";

import { NOTO_SANS_REGULAR_TTF_BASE64 } from "@ai-catalyst/services/artifact/internal/renderers/pdf/fonts/noto-sans-regular";
import { NOTO_SANS_BOLD_TTF_BASE64 } from "@ai-catalyst/services/artifact/internal/renderers/pdf/fonts/noto-sans-bold";

const REGULAR_TTF_BYTES = Buffer.from(NOTO_SANS_REGULAR_TTF_BASE64, "base64");
const BOLD_TTF_BYTES = Buffer.from(NOTO_SANS_BOLD_TTF_BASE64, "base64");

// The bare fontkit-parsed fonts, for coverage/measurement (pdf/metrics.ts)
// against the identical bytes that get embedded — parsed once per module
// load, not per render.
export const REGULAR_FONTKIT_FONT: FontkitFont = createFontkitFont(REGULAR_TTF_BYTES) as FontkitFont;
export const BOLD_FONTKIT_FONT: FontkitFont = createFontkitFont(BOLD_TTF_BYTES) as FontkitFont;

export interface EmbeddedFonts {
  regular: PDFFont;
  bold: PDFFont;
}

const REGULAR_RESOURCE_NAME = "WorkbookSans";
const BOLD_RESOURCE_NAME = "WorkbookSansBold";

/**
 * Embeds both faces into `doc` and wires /DR + /DA at the AcroForm level.
 *
 * Neither `field.addToPage({ font })` nor `field.updateAppearances(font)`
 * registers a font in the AcroForm's shared default resources on its own —
 * inspecting a generated PDF's AcroForm dictionary showed only `/Fields`,
 * no `/DR` at all. This matters because a viewer that later regenerates a
 * field's appearance (e.g. after the Founder edits previously-typed text)
 * resolves the font through `/DR`, not through whatever
 * `updateAppearances()` pre-rendered at generation time.
 *
 * Deliberately does NOT set `/NeedAppearances: true` — pre-generated
 * appearances via `updateAppearances()` are the tested, verified path, and
 * shifting rendering responsibility onto the viewer would trade a proven
 * path for one with inconsistent, unverifiable cross-viewer support.
 */
export async function embedWorkbookFonts(doc: PDFDocument): Promise<EmbeddedFonts> {
  doc.registerFontkit(fontkit);
  // { subset: false } is required, not optional: AcroForm field input is
  // arbitrary Founder text unknowable at generation time, and a subset
  // trimmed to only the drawn locked text would be wrong the moment a
  // Founder typed a character that was never drawn. (Subsetting a
  // WOFF2-decompressed font also throws outright in this pdf-lib version —
  // moot here, since full embedding is required regardless.)
  const regular = await doc.embedFont(REGULAR_TTF_BYTES, { subset: false });
  const bold = await doc.embedFont(BOLD_TTF_BYTES, { subset: false });

  const acroFormRef = doc.catalog.get(PDFName.of("AcroForm"));
  if (!acroFormRef) {
    throw new Error(
      "WORKBOOK_RENDER_FAILED: no AcroForm dictionary — call doc.getForm() (which creates it) before embedWorkbookFonts.",
    );
  }
  const acroForm = doc.context.lookup(acroFormRef, PDFDict);
  acroForm.set(
    PDFName.of("DR"),
    doc.context.obj({
      Font: doc.context.obj({
        [REGULAR_RESOURCE_NAME]: regular.ref,
        [BOLD_RESOURCE_NAME]: bold.ref,
      }),
    }),
  );
  // The AcroForm-level default: individual fields still get their own /DA
  // (see pdf/render-plan.ts) so each can pick its own size, but every field
  // needs a fallback that resolves through /DR.
  acroForm.set(PDFName.of("DA"), PDFString.of(`/${REGULAR_RESOURCE_NAME} 10 Tf 0 g`));

  return { regular, bold };
}
