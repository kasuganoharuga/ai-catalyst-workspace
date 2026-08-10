// Embeds committed TTF faces at render time (plan-build uses bare fontkit via pdf/metrics.ts).
// Pre-decompressed TTF avoids corrupt ToUnicode CMaps from raw WOFF2 bytes.
import fontkit from "@pdf-lib/fontkit";
// fontkit ESM exports `create` as a named export — default import fails under Vitest/Node ESM.
import { create as createFontkitFont, type Font as FontkitFont } from "fontkit";
import {
  PDFDict,
  PDFDocument,
  PDFName,
  PDFString,
  type PDFFont,
} from "pdf-lib";

import { NOTO_SANS_REGULAR_TTF_BASE64 } from "@ai-catalyst/services/artifact/internal/renderers/pdf/fonts/noto-sans-regular";
import { NOTO_SANS_BOLD_TTF_BASE64 } from "@ai-catalyst/services/artifact/internal/renderers/pdf/fonts/noto-sans-bold";

const REGULAR_TTF_BYTES = Buffer.from(NOTO_SANS_REGULAR_TTF_BASE64, "base64");
const BOLD_TTF_BYTES = Buffer.from(NOTO_SANS_BOLD_TTF_BASE64, "base64");

// Bare fontkit fonts for pdf/metrics.ts — same bytes as embedded faces, parsed once per load.
export const REGULAR_FONTKIT_FONT: FontkitFont = createFontkitFont(
  REGULAR_TTF_BYTES,
) as FontkitFont;
export const BOLD_FONTKIT_FONT: FontkitFont = createFontkitFont(
  BOLD_TTF_BYTES,
) as FontkitFont;

export interface EmbeddedFonts {
  regular: PDFFont;
  bold: PDFFont;
}

const REGULAR_RESOURCE_NAME = "WorkbookSans";
const BOLD_RESOURCE_NAME = "WorkbookSansBold";

/**
 * Embeds both faces and wires AcroForm /DR + /DA so viewers can regenerate
 * field appearances from shared font resources — not just pre-rendered AP streams.
 */
export async function embedWorkbookFonts(
  doc: PDFDocument,
): Promise<EmbeddedFonts> {
  doc.registerFontkit(fontkit);
  // { subset: false } — Founder field input is arbitrary; subsetting to drawn text would truncate typing.
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
  // AcroForm-level default; per-field /DA in render-plan.ts overrides size.
  acroForm.set(
    PDFName.of("DA"),
    PDFString.of(`/${REGULAR_RESOURCE_NAME} 10 Tf 0 g`),
  );

  return { regular, bold };
}
