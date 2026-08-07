// Wires parse + buildPlan + assertPlanMatchesModel + render into one
// WorkbookRenderer for Validation-Roadmap-30-Day.md — see
// problem-interview-workbook-v1.ts's header for the shared rationale.
import { assertValidationRoadmapPlan, buildValidationRoadmapPlan } from "@ai-catalyst/services/artifact/internal/renderers/plan/validation-roadmap-plan";
import { VALIDATION_ROADMAP_FIELD_MANIFEST_V1 } from "@ai-catalyst/services/artifact/internal/renderers/manifests/roadmap-v1";
import { parseValidationRoadmap } from "@ai-catalyst/services/artifact/internal/renderers/parse/validation-roadmap";
import { renderWorkbookPlan } from "@ai-catalyst/services/artifact/internal/renderers/pdf/render-plan";
import type { ValidationRoadmapModel } from "./parse/validation-roadmap.js";
import type { RequiredSection, WorkbookRenderer } from "./types.js";

// Every `##`/`###` heading in module-4.ts's VALIDATION_ROADMAP_TEMPLATE, and
// nothing else — renderer-template-contract.test.ts (commit 6) checks both
// directions against the live template.
const REQUIRED_SECTIONS: RequiredSection[] = [
  "Venture",
  "Constraints",
  "What These Experiments Test",
  "Experiments",
  "Expected evidence signal strength",
  "Start Here",
  "How to Record Results",
];

export const validationRoadmapWorkbookV1: WorkbookRenderer<ValidationRoadmapModel> = {
  rendererKey: "validation_roadmap_workbook_v1",
  rendererVersion: "1",
  mimeType: "application/pdf",
  extension: "pdf",
  downloadFilename: "Validation-Roadmap-Workbook.pdf",
  requiredSections: REQUIRED_SECTIONS,
  fieldManifest: VALIDATION_ROADMAP_FIELD_MANIFEST_V1,
  parse: parseValidationRoadmap,
  buildPlan: buildValidationRoadmapPlan,
  assertPlanMatchesModel: assertValidationRoadmapPlan,
  render: renderWorkbookPlan,
};
