// Reopens a rendered PDF and checks only what a PDF can reliably answer:
// field names/uniqueness, one widget per field, dropdown option vocab, page
// count, the AcroForm's own /DR font resources, and the provenance Info-dict
// keys. Content equality (do the drawn strings match the confirmed
// Markdown) is NOT this file's job — see types.ts's header and each
// renderer's assertPlanMatchesModel for why that's checked against the
// plain-data WorkbookRenderPlan instead, never by re-parsing rendered bytes.
import {
  PDFCheckBox,
  PDFDict,
  PDFDocument,
  PDFDropdown,
  PDFName,
  PDFString,
  PDFTextField,
} from "pdf-lib";

import { PROVENANCE_INFO_KEYS } from "@ai-catalyst/services/artifact/internal/renderers/types";
import type { FieldManifest, FieldSpec, WorkbookRenderPlan } from "./types.js";

function fail(message: string): never {
  throw new Error(`WORKBOOK_RENDER_FAILED: ${message}`);
}

/**
 * Finds the manifest field spec whose name shape matches `suffix` — fixed
 * specs match by exact suffix, family specs match `suffixTemplate` with
 * `{n}` standing in for any run of digits. Doesn't need per-section family
 * counts (unlike manifest-fields.ts's expectedFieldNames): it only needs to
 * know, for a suffix that already exists in the plan, which spec describes
 * its type/capacity/options.
 */
function manifestSpecForSuffix(
  manifest: FieldManifest,
  suffix: string,
): FieldSpec | undefined {
  return manifest.fields.find((field) => {
    if (field.kind === "fixed") return field.suffix === suffix;
    const pattern = new RegExp(
      `^${field.suffixTemplate.replace("{n}", "\\d+")}$`,
    );
    return pattern.test(suffix);
  });
}

/** Splits "interview_3.pass_bar_2" into { sectionPrefix: "interview", suffix: "pass_bar_2" }. */
function splitFieldName(
  name: string,
): { sectionPrefix: string; suffix: string } | null {
  const dot = name.indexOf(".");
  if (dot === -1) return null;
  const sectionToken = name.slice(0, dot);
  const underscore = sectionToken.lastIndexOf("_");
  if (underscore === -1) return null;
  return {
    sectionPrefix: sectionToken.slice(0, underscore),
    suffix: name.slice(dot + 1),
  };
}

function assertFieldsMatchManifest(
  plan: WorkbookRenderPlan,
  manifest: FieldManifest,
): void {
  for (const field of plan.fields) {
    const parts = splitFieldName(field.name);
    if (!parts || parts.sectionPrefix !== manifest.sectionPrefix) {
      fail(
        `field "${field.name}" does not match manifest section prefix "${manifest.sectionPrefix}".`,
      );
    }
    const spec = manifestSpecForSuffix(manifest, parts.suffix);
    if (!spec) {
      fail(
        `field "${field.name}" has no matching entry in the field manifest.`,
      );
    }
    if (spec.type !== field.kind) {
      fail(
        `field "${field.name}" is "${field.kind}" in the plan but "${spec.type}" in the manifest.`,
      );
    }
    if (
      field.kind === "text" &&
      spec.capacity !== undefined &&
      field.capacity !== spec.capacity
    ) {
      fail(
        `field "${field.name}" has capacity ${field.capacity} but the manifest declares ${spec.capacity}.`,
      );
    }
    if (field.kind === "dropdown" && spec.options !== undefined) {
      const matches =
        spec.options.length === field.options.length &&
        spec.options.every((o, i) => o === field.options[i]);
      if (!matches) {
        fail(
          `field "${field.name}" has options [${field.options.join(", ")}] but the manifest declares [${spec.options.join(", ")}].`,
        );
      }
    }
  }
}

async function assertFieldsMatchPdf(
  doc: PDFDocument,
  plan: WorkbookRenderPlan,
): Promise<void> {
  const form = doc.getForm();
  // form.getFields() reports fully-qualified terminal field names, correctly
  // resolving the implicit shared parent that dot-separated names create in
  // PDF's own field hierarchy (e.g. "interview_1" for "interview_1.date_day"
  // and "interview_1.participant") — counting entries in the top-level
  // AcroForm /Fields array instead would collapse siblings into that parent
  // and undercount.
  const pdfFields = form.getFields();
  const pdfNames = new Set(pdfFields.map((f) => f.getName()));
  const planNames = new Set(plan.fields.map((f) => f.name));

  for (const name of planNames) {
    if (!pdfNames.has(name))
      fail(`the plan declares field "${name}" but the PDF has no such field.`);
  }
  for (const name of pdfNames) {
    if (!planNames.has(name))
      fail(`the PDF has field "${name}" that the plan never declared.`);
  }

  for (const field of pdfFields) {
    const widgets = field.acroField.getWidgets();
    if (widgets.length !== 1) {
      fail(
        `field "${field.getName()}" has ${widgets.length} widgets — every field must appear on exactly one page.`,
      );
    }
  }

  for (const planField of plan.fields) {
    if (planField.kind === "text") {
      const textField = form.getTextField(planField.name);
      if (!(textField instanceof PDFTextField))
        fail(`field "${planField.name}" is not a text field in the PDF.`);
      if (textField.getMaxLength() !== planField.capacity) {
        fail(
          `field "${planField.name}" has PDF maxLength ${textField.getMaxLength()} but the plan declares capacity ${planField.capacity}.`,
        );
      }
      if (textField.isMultiline() !== planField.multiline) {
        fail(
          `field "${planField.name}" has multiline=${textField.isMultiline()} in the PDF but multiline=${planField.multiline} in the plan.`,
        );
      }
    } else if (planField.kind === "checkbox") {
      const checkbox = form.getCheckBox(planField.name);
      if (!(checkbox instanceof PDFCheckBox))
        fail(`field "${planField.name}" is not a checkbox in the PDF.`);
    } else {
      const dropdown = form.getDropdown(planField.name);
      if (!(dropdown instanceof PDFDropdown))
        fail(`field "${planField.name}" is not a dropdown in the PDF.`);
      const options = dropdown.getOptions();
      const matches =
        options.length === planField.options.length &&
        options.every((o, i) => o === planField.options[i]);
      if (!matches) {
        fail(
          `field "${planField.name}" has PDF options [${options.join(", ")}] but the plan declares [${planField.options.join(", ")}].`,
        );
      }
    }
  }
}

// Checks the AcroForm's own /DR font resource shelf only — the shared
// resources this renderer explicitly wires in embed-fonts.ts. pdf-lib's
// default checkbox appearance stream separately references the base-14
// Helvetica font for its check-mark glyph (plan §7 finding 7), but that
// reference lives in each checkbox widget's own local appearance-stream
// resources, never in /DR — so it never appears here, and no Helvetica
// exception needs to be carved out.
function assertDrFonts(doc: PDFDocument): void {
  const acroFormRef = doc.catalog.get(PDFName.of("AcroForm"));
  if (!acroFormRef) fail("no AcroForm dictionary.");
  const acroForm = doc.context.lookup(acroFormRef, PDFDict);
  const drRef = acroForm.get(PDFName.of("DR"));
  if (!drRef) fail("AcroForm has no /DR default-resources dictionary.");
  const dr = doc.context.lookup(drRef, PDFDict);
  const fontDictRef = dr.get(PDFName.of("Font"));
  if (!fontDictRef) fail("AcroForm /DR has no /Font dictionary.");
  const fontDict = doc.context.lookup(fontDictRef, PDFDict);

  const resourceNames = fontDict
    .keys()
    .map((key) => key.asString().replace(/^\//, ""));
  if (
    !resourceNames.includes("WorkbookSans") ||
    !resourceNames.includes("WorkbookSansBold")
  ) {
    fail(
      `AcroForm /DR /Font must declare both WorkbookSans and WorkbookSansBold, found [${resourceNames.join(", ")}].`,
    );
  }
}

function assertProvenanceInfoDict(
  doc: PDFDocument,
  plan: WorkbookRenderPlan,
): void {
  const infoRef = doc.context.trailerInfo.Info;
  if (!infoRef) fail("PDF has no Info dictionary.");
  const info = doc.context.lookup(infoRef, PDFDict);
  const { provenance } = plan;
  const expected: Record<(typeof PROVENANCE_INFO_KEYS)[number], string> = {
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
  for (const key of PROVENANCE_INFO_KEYS) {
    const value = info.get(PDFName.of(key));
    if (!(value instanceof PDFString)) {
      fail(`Info dictionary is missing provenance key "${key}".`);
    }
    if (value.decodeText() !== expected[key]) {
      fail(
        `Info dictionary key "${key}" is "${value.decodeText()}" but provenance declares "${expected[key]}".`,
      );
    }
  }
}

/**
 * The second (and final) pipeline gate — see registry.ts's
 * registerWorkbookRenderer, which calls this unconditionally after render()
 * so no caller can skip it.
 */
export async function assertPdfStructure(
  buffer: Buffer,
  plan: WorkbookRenderPlan,
  manifest: FieldManifest,
): Promise<void> {
  assertFieldsMatchManifest(plan, manifest);

  const doc = await PDFDocument.load(buffer);
  if (doc.getPageCount() !== plan.pages.length) {
    fail(
      `PDF has ${doc.getPageCount()} pages but the plan expected ${plan.pages.length}.`,
    );
  }
  await assertFieldsMatchPdf(doc, plan);
  assertDrFonts(doc);
  assertProvenanceInfoDict(doc, plan);
}
