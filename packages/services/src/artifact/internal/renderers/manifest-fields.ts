// Walks a FieldManifest (see types.ts) to produce the fully-qualified field
// names it describes for a given resolved section count and per-section
// family counts. Both buildPlan() (to know what to generate) and, later,
// assert-pdf-structure.ts (commit 4, to know what's expected) call this —
// one walk, so the two can never independently disagree about what a
// manifest means.
import type { FamilyCountSpec, FieldManifest, FieldSpec } from "./types.js";

export interface ManifestResolutionContext {
  sectionCount: number;
  /** Resolves a family field's `count.source` (e.g. "passBarConditions") to an actual count for one section. */
  familyCount: (source: string, sectionIndex: number) => number;
}

function resolveFamilyCount(
  spec: FamilyCountSpec,
  context: ManifestResolutionContext,
  sectionIndex: number,
): number {
  if (spec.kind === "fixed") return spec.value;
  const resolved = context.familyCount(spec.source, sectionIndex);
  if (!Number.isInteger(resolved) || resolved < spec.minimum || resolved > spec.maximum) {
    throw new Error(
      `WORKBOOK_RENDER_FAILED: resolved count ${resolved} for "${spec.source}" is outside the manifest's ` +
        `declared range ${spec.minimum}-${spec.maximum}.`,
    );
  }
  return resolved;
}

function fieldNamesForSpec(field: FieldSpec, context: ManifestResolutionContext, sectionIndex: number): string[] {
  if (field.kind === "fixed") {
    return [field.suffix];
  }
  const count = resolveFamilyCount(field.count, context, sectionIndex);
  return Array.from({ length: count }, (_, i) => field.suffixTemplate.replace("{n}", String(i + 1)));
}

/** Every fully-qualified field name (`interview_1.date_day`, `interview_1.pass_bar_2`, ...) this manifest produces, given `context`. */
export function expectedFieldNames(manifest: FieldManifest, context: ManifestResolutionContext): string[] {
  const names: string[] = [];
  for (let section = 1; section <= context.sectionCount; section += 1) {
    for (const field of manifest.fields) {
      for (const suffix of fieldNamesForSpec(field, context, section)) {
        names.push(`${manifest.sectionPrefix}_${section}.${suffix}`);
      }
    }
  }
  return names;
}

/** Resolves the manifest's own `sectionCount` spec against a value the caller has already decided (a Founder's choice, or a model-derived count). */
export function resolveSectionCount(manifest: FieldManifest, requested: number): number {
  const spec = manifest.sectionCount;
  if (spec.kind === "fixed") return spec.value;
  const bounds = spec.kind === "option" ? { minimum: spec.minimum, maximum: spec.maximum } : spec;
  if (!Number.isInteger(requested) || requested < bounds.minimum || requested > bounds.maximum) {
    throw new Error(
      `WORKBOOK_RENDER_FAILED: requested section count ${requested} is outside the manifest's declared range ` +
        `${bounds.minimum}-${bounds.maximum}.`,
    );
  }
  return requested;
}
