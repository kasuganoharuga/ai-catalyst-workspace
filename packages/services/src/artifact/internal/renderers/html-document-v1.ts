import { buildMarkdownDocumentHtml } from "@ai-catalyst/services/artifact/internal/renderers/html/markdown-document-html";
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
}): RegisteredWorkbookRenderer {
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
      const plan = emptyPlan(markdown, provenance);
      const html = buildMarkdownDocumentHtml({
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
