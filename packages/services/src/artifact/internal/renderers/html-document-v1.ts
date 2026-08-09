import { buildMarkdownDocumentHtml } from "@ai-catalyst/services/artifact/internal/renderers/html/markdown-document-html";
import { buildValidationRoadmapHtml } from "@ai-catalyst/services/artifact/internal/renderers/html/validation-roadmap-html";
import { renderHtmlToPdf } from "@ai-catalyst/services/artifact/internal/renderers/html/gotenberg";
import type {
  LockedContentEntry,
  Provenance,
  RegisteredWorkbookRenderer,
  WorkbookRenderPlan,
} from "@ai-catalyst/services/artifact/internal/renderers/types";

function emptyPlan(
  markdown: string,
  provenance: Provenance,
): WorkbookRenderPlan {
  const body: LockedContentEntry = {
    role: "markdown_body",
    text: markdown,
    page: 0,
    x: 0,
    y: 0,
    maxWidth: 500,
    size: 11,
    bold: false,
  };
  return {
    pages: [{ footerLabel: null }],
    fields: [],
    rects: [],
    lockedContent: [body],
    provenance,
  };
}

export function registerHtmlDocumentRenderer(input: {
  rendererKey: string;
  downloadFilename: string;
  title: string;
  footerLabel: string;
  buildHtml?: (input: {
    title: string;
    markdown: string;
    footerLabel: string;
  }) => string;
}): RegisteredWorkbookRenderer {
  const buildHtml = input.buildHtml ?? buildMarkdownDocumentHtml;
  return {
    rendererKey: input.rendererKey,
    rendererVersion: "1",
    mimeType: "application/pdf",
    extension: "pdf",
    downloadFilename: input.downloadFilename,
    requiredSections: [],
    fieldManifest: {
      sectionPrefix: "doc",
      sectionCount: { kind: "fixed", value: 1 },
      fields: [],
    },
    async build(markdown, provenance) {
      // `markdown` is the confirmed submission body (filled document), not
      // the seed template — rendered to HTML then printed via Gotenberg.
      const plan = emptyPlan(markdown, provenance);
      const html = buildHtml({
        title: input.title,
        markdown,
        footerLabel: input.footerLabel,
      });
      const buffer = await renderHtmlToPdf({ indexHtml: html });
      return { buffer, plan };
    },
  };
}

export const validationRoadmapHtmlV1Registered = registerHtmlDocumentRenderer({
  rendererKey: "validation_roadmap_html_v1",
  downloadFilename: "Validation-Roadmap-30-Day.pdf",
  title: "30-Day Validation Roadmap",
  footerLabel: "AI Catalyst · 30-Day Validation Roadmap",
  buildHtml: buildValidationRoadmapHtml,
});

export const idealCustomerAvatarHtmlV1Registered = registerHtmlDocumentRenderer(
  {
    rendererKey: "ideal_customer_avatar_html_v1",
    downloadFilename: "Ideal-Customer-Avatar.pdf",
    title: "Ideal Customer Avatar",
    footerLabel: "AI Catalyst · Ideal Customer Avatar",
  },
);

export const pressureTestVerdictHtmlV1Registered = registerHtmlDocumentRenderer(
  {
    rendererKey: "pressure_test_verdict_html_v1",
    downloadFilename: "Pressure-Test-Verdict.pdf",
    title: "Pressure-Test Verdict",
    footerLabel: "AI Catalyst · Pressure-Test Verdict",
  },
);

export const problemStatementHtmlV1Registered = registerHtmlDocumentRenderer({
  rendererKey: "problem_statement_html_v1",
  downloadFilename: "Problem-Statement.pdf",
  title: "Problem Statement",
  footerLabel: "AI Catalyst · Problem Statement",
});

export const evidenceOfUnmetNeedHtmlV1Registered = registerHtmlDocumentRenderer(
  {
    rendererKey: "evidence_of_unmet_need_html_v1",
    downloadFilename: "Evidence-Of-Unmet-Need.pdf",
    title: "Evidence of Unmet Need",
    footerLabel: "AI Catalyst · Evidence of Unmet Need",
  },
);
