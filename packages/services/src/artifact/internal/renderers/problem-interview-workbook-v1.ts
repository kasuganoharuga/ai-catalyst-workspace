// Wires parse + buildPlan + assertPlanMatchesModel + render into one
// WorkbookRenderer for Problem-Interview-Guide.md, registered under
// registry.ts. See plan/interview-workbook-plan.ts and
// parse/interview-guide.ts for the actual logic — this file only combines
// them per the contract in registry.ts.
import {
  assertInterviewWorkbookPlan,
  buildInterviewWorkbookPlan,
} from "@ai-catalyst/services/artifact/internal/renderers/plan/interview-workbook-plan";
import { PROBLEM_INTERVIEW_FIELD_MANIFEST_V1 } from "@ai-catalyst/services/artifact/internal/renderers/manifests/interview-v1";
import { parseInterviewGuide } from "@ai-catalyst/services/artifact/internal/renderers/parse/interview-guide";
import { renderWorkbookPlan } from "@ai-catalyst/services/artifact/internal/renderers/pdf/render-plan";
import type { InterviewGuideModel } from "./parse/interview-guide.js";
import type { RequiredSection, WorkbookRenderer } from "./types.js";

// Every `##` heading in module-3.ts's PROBLEM_INTERVIEW_GUIDE_TEMPLATE, and
// nothing else — renderer-template-contract.test.ts (commit 6) checks both
// directions against the live template.
const REQUIRED_SECTIONS: RequiredSection[] = [
  "Venture",
  "Interview Target",
  "What This Interview Tests",
  "Five Interview Questions",
  "Mom Test Rules",
  "Pass Bar",
  "Kill Criteria",
  "After Each Call",
  "Where Results Go",
];

export const problemInterviewWorkbookV1: WorkbookRenderer<InterviewGuideModel> =
  {
    rendererKey: "problem_interview_workbook_v1",
    rendererVersion: "1",
    mimeType: "application/pdf",
    extension: "pdf",
    downloadFilename: "Problem-Interview-Workbook.pdf",
    requiredSections: REQUIRED_SECTIONS,
    fieldManifest: PROBLEM_INTERVIEW_FIELD_MANIFEST_V1,
    parse: parseInterviewGuide,
    buildPlan: buildInterviewWorkbookPlan,
    assertPlanMatchesModel: assertInterviewWorkbookPlan,
    render: renderWorkbookPlan,
  };
