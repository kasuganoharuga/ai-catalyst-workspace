import { buildInterviewGuideHtml } from "@ai-catalyst/services/artifact/internal/renderers/html/interview-guide-html";
import { renderHtmlToPdf } from "@ai-catalyst/services/artifact/internal/renderers/html/gotenberg";
import {
  parseInterviewGuide,
  type InterviewGuideModel,
} from "@ai-catalyst/services/artifact/internal/renderers/parse/interview-guide";
import type {
  LockedContentEntry,
  Provenance,
  RegisteredWorkbookRenderer,
  WorkbookRenderOptions,
  WorkbookRenderPlan,
} from "@ai-catalyst/services/artifact/internal/renderers/types";

function locked(role: string, text: string): LockedContentEntry {
  return {
    role,
    text,
    page: 0,
    x: 0,
    y: 0,
    maxWidth: 500,
    size: 11,
    bold: false,
  };
}

function buildPlan(
  model: InterviewGuideModel,
  provenance: Provenance,
  _options?: WorkbookRenderOptions,
): WorkbookRenderPlan {
  return {
    pages: [{ footerLabel: "AI Catalyst · Problem Interview Guide" }],
    fields: [],
    rects: [],
    lockedContent: [
      locked("venture_name", model.ventureName),
      locked("interview_target", model.interviewTarget),
      locked("what_this_tests", model.whatThisInterviewTests),
      locked("opening_script", model.openingScript),
      ...model.questions.map((text, i) => locked(`question_${i + 1}`, text)),
      ...model.questionGuidance.flatMap((guidance, i) => [
        locked(`question_${i + 1}_suggestion`, guidance.suggestion),
        ...guidance.listenFor.map((text, j) =>
          locked(`question_${i + 1}_listen_for_${j + 1}`, text),
        ),
      ]),
      locked("pass_bar_preamble", model.passBar.preamble),
      ...model.passBar.conditions.map((text, i) =>
        locked(`pass_bar_${i + 1}`, text),
      ),
      ...model.killCriteria.map((text, i) => locked(`kill_${i + 1}`, text)),
      ...model.assumptions.map((row, i) =>
        locked(`assumption_${i + 1}`, row.assumption),
      ),
      ...model.closingQuestions.map((text, i) =>
        locked(`closing_question_${i + 1}`, text),
      ),
    ],
    provenance,
  };
}

function assertPlanMatchesModel(
  plan: WorkbookRenderPlan,
  model: InterviewGuideModel,
): void {
  for (let i = 0; i < model.questions.length; i++) {
    const entry = plan.lockedContent.find(
      (c) => c.role === `question_${i + 1}`,
    );
    if (!entry || entry.text !== model.questions[i]) {
      throw new Error(
        `WORKBOOK_RENDER_FAILED: plan question_${i + 1} does not match model.`,
      );
    }
  }
}

export async function renderInterviewGuideHtmlPdf(
  model: InterviewGuideModel,
): Promise<Buffer> {
  const html = buildInterviewGuideHtml({
    ventureName: model.ventureName,
    interviewTarget: model.interviewTarget,
    whatThisInterviewTests: model.whatThisInterviewTests,
    openingScript: model.openingScript,
    questions: [...model.questions],
    questionGuidance: model.questionGuidance.map((guidance) => ({
      listenFor: [...guidance.listenFor],
      suggestion: guidance.suggestion,
    })),
    passBar: model.passBar,
    killCriteria: [...model.killCriteria],
    assumptions: model.assumptions.map((row) => ({ ...row })),
    closingQuestions: [...model.closingQuestions],
  });
  return renderHtmlToPdf({ indexHtml: html });
}

/**
 * Registered HTML→Gotenberg Interview Guide renderer (no AcroForm).
 * Skips assertPdfStructure — Chromium PDFs have no field widgets.
 */
export const interviewGuideHtmlV1Registered: RegisteredWorkbookRenderer = {
  rendererKey: "interview_guide_html_v1",
  rendererVersion: "1",
  mimeType: "application/pdf",
  extension: "pdf",
  downloadFilename: "Problem-Interview-Guide.pdf",
  requiredSections: [],
  fieldManifest: {
    sectionPrefix: "interview",
    sectionCount: { kind: "fixed", value: 1 },
    fields: [],
  },
  async build(markdown, provenance, options) {
    const model = parseInterviewGuide(markdown);
    const plan = buildPlan(model, provenance, options);
    assertPlanMatchesModel(plan, model);
    const buffer = await renderInterviewGuideHtmlPdf(model);
    return { buffer, plan };
  },
};

export { buildInterviewGuideHtml };
