// The registry for workbook renderers — mirrors
// artifact/internal/validators/registry.ts's resolveValidator pattern
// exactly (same `overrides` DI seam, same INTERNAL_INVARIANT_ERROR for an
// unregistered key).
//
// Two-tier design: WorkbookRenderer<TModel> is what each renderer module
// authors (problem-interview-workbook-v1.ts, validation-roadmap-workbook-v1.ts)
// — fully typed, TModel is real, so parse/buildPlan/assertPlanMatchesModel
// stay safely tied to the same model type. RegisteredWorkbookRenderer is
// what this registry stores and the service sees — no generic, no model in
// any signature, so the calling service carries no per-renderer branching
// or `as unknown as` casts. registerWorkbookRenderer() bridges the two, and
// is also where both pipeline assertion gates
// (assertPlanMatchesModel, assertPdfStructure) are wired in — no caller of
// `.build()` can skip either.
//
// Contract types live in ./types.js (not here) so renderer modules can
// import them without a circular dependency back into this registry.
import { ServiceError } from "@ai-catalyst/services/errors";

// Package subpath imports for Turbopack resolution when apps/web bundles services.
import { assertPdfStructure } from "@ai-catalyst/services/artifact/internal/renderers/assert-pdf-structure";
import { problemInterviewWorkbookV1 } from "@ai-catalyst/services/artifact/internal/renderers/problem-interview-workbook-v1";
import { validationRoadmapWorkbookV1 } from "@ai-catalyst/services/artifact/internal/renderers/validation-roadmap-workbook-v1";

import type { RegisteredWorkbookRenderer, WorkbookRenderer } from "./types.js";

export type {
  RegisteredWorkbookRenderer,
  RequiredSection,
  WorkbookRenderOptions,
  WorkbookRenderer,
} from "./types.js";

export function registerWorkbookRenderer<TModel>(renderer: WorkbookRenderer<TModel>): RegisteredWorkbookRenderer {
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
  [problemInterviewWorkbookV1.rendererKey]: registerWorkbookRenderer(problemInterviewWorkbookV1),
  [validationRoadmapWorkbookV1.rendererKey]: registerWorkbookRenderer(validationRoadmapWorkbookV1),
};

/**
 * Resolves a RegisteredWorkbookRenderer by `artifact_definitions.renderer_key`.
 * `overrides` is a test-only DI seam (same pattern as `resolveValidator`)
 * letting tests register a fixture renderer without touching the real
 * registrations.
 *
 * Throws INTERNAL_INVARIANT_ERROR (never NOT_FOUND/VALIDATION_ERROR) when
 * unresolved — content has seeded a `renderer_key` that no deployed code
 * registers here, which is a deployment inconsistency, not a normal
 * business error the caller can act on.
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
