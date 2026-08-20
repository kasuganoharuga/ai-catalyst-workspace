// Workbook renderer registry — mirrors resolveValidator (overrides DI seam, INTERNAL_INVARIANT_ERROR).
// WorkbookRenderer<TModel> is per-renderer typed code; RegisteredWorkbookRenderer is what services call.
// registerWorkbookRenderer wires assertPlanMatchesModel and assertPdfStructure — callers cannot skip either.
// Contract types live in ./types.js to avoid import cycles.
import { ServiceError } from "@ai-catalyst/services/errors";

// Package subpath imports for Turbopack resolution when apps/web bundles services.
import { assertPdfStructure } from "@ai-catalyst/services/artifact/internal/renderers/assert-pdf-structure";
import { idealCustomerAvatarWorkbookV1 } from "@ai-catalyst/services/artifact/internal/renderers/ideal-customer-avatar-workbook-v1";
import { problemInterviewWorkbookV1 } from "@ai-catalyst/services/artifact/internal/renderers/problem-interview-workbook-v1";
import { validationRoadmapWorkbookV1 } from "@ai-catalyst/services/artifact/internal/renderers/validation-roadmap-workbook-v1";

import {
  evidenceOfUnmetNeedHtmlV1Registered,
  idealCustomerAvatarHtmlV1Registered,
  pressureTestVerdictHtmlV1Registered,
  problemStatementHtmlV1Registered,
  validationRoadmapHtmlV1Registered,
} from "@ai-catalyst/services/artifact/internal/renderers/html-document-v1";
import { interviewGuideHtmlV1Registered } from "@ai-catalyst/services/artifact/internal/renderers/interview-guide-html-v1";
import type {
  RegisteredWorkbookRenderer,
  WorkbookRenderer,
} from "@ai-catalyst/services/artifact/internal/renderers/types";

export type {
  RegisteredWorkbookRenderer,
  RequiredSection,
  WorkbookRenderOptions,
  WorkbookRenderer,
} from "@ai-catalyst/services/artifact/internal/renderers/types";

export function registerWorkbookRenderer<TModel>(
  renderer: WorkbookRenderer<TModel>,
): RegisteredWorkbookRenderer {
  return {
    rendererKey: renderer.rendererKey,
    rendererVersion: renderer.rendererVersion,
    mimeType: renderer.mimeType,
    extension: renderer.extension,
    downloadFilename: renderer.downloadFilename,
    requiredSections: renderer.requiredSections,
    fieldManifest: renderer.fieldManifest,
    async build(markdown, provenance, options) {
      const model = renderer.parse(markdown);
      const plan = renderer.buildPlan(model, provenance, options);
      renderer.assertPlanMatchesModel(plan, model);
      const buffer = await renderer.render(plan);
      await assertPdfStructure(buffer, plan, renderer.fieldManifest);
      return { buffer, plan };
    },
  };
}

const WORKBOOK_RENDERERS: Record<string, RegisteredWorkbookRenderer> = {
  // Legacy pdf-lib paths retained for in-flight program versions.
  [problemInterviewWorkbookV1.rendererKey]: registerWorkbookRenderer(
    problemInterviewWorkbookV1,
  ),
  [validationRoadmapWorkbookV1.rendererKey]: registerWorkbookRenderer(
    validationRoadmapWorkbookV1,
  ),
  [idealCustomerAvatarWorkbookV1.rendererKey]: registerWorkbookRenderer(
    idealCustomerAvatarWorkbookV1,
  ),
  // HTML → Gotenberg printable PDFs (current seed defaults).
  [interviewGuideHtmlV1Registered.rendererKey]: interviewGuideHtmlV1Registered,
  [validationRoadmapHtmlV1Registered.rendererKey]:
    validationRoadmapHtmlV1Registered,
  [idealCustomerAvatarHtmlV1Registered.rendererKey]:
    idealCustomerAvatarHtmlV1Registered,
  [pressureTestVerdictHtmlV1Registered.rendererKey]:
    pressureTestVerdictHtmlV1Registered,
  [problemStatementHtmlV1Registered.rendererKey]:
    problemStatementHtmlV1Registered,
  [evidenceOfUnmetNeedHtmlV1Registered.rendererKey]:
    evidenceOfUnmetNeedHtmlV1Registered,
};

/**
 * Resolves by artifact_definitions.renderer_key. `overrides` is test-only DI.
 * Throws INTERNAL_INVARIANT_ERROR when unregistered — deployment mismatch, not a user error.
 */
export function resolveWorkbookRenderer(
  rendererKey: string,
  overrides?: Record<string, RegisteredWorkbookRenderer>,
): RegisteredWorkbookRenderer {
  const renderer = overrides?.[rendererKey] ?? WORKBOOK_RENDERERS[rendererKey];
  if (!renderer) {
    throw new ServiceError(
      "INTERNAL_INVARIANT_ERROR",
      `No WorkbookRenderer is registered for renderer_key "${rendererKey}".`,
    );
  }
  return renderer;
}
