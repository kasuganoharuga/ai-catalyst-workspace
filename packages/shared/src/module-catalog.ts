// Single source of truth for the Founder-facing Module catalog DTO, shared
// by packages/services (producer) and apps/web (consumer) so the two never
// drift into two separate shapes for the same data.

export type ModuleCatalogStatus = "live" | "coming_soon";

export type ModuleType = "setup" | "standard" | "review" | "completion";

export type ModuleCompletionMode =
  "artifact" | "confirmation" | "artifact_and_confirmation" | "system";

/**
 * Outline from template ## headings; items reserved for denser outline later.
 */
export interface ModuleCatalogArtifactOutlineSection {
  heading: string;
  items: string[];
}

/** Formats a workbook renderer may produce. PDF only today; kept as a union rather than a boolean so a future format is additive, not a breaking DTO change. */
export type WorkbookFormat = "pdf";

export interface ModuleCatalogArtifact {
  artifactKey: string;
  name: string;
  requiredFilename: string | null;
  /** False for supporting artefacts that never block completion (e.g. Module 4 notes). */
  isRequired: boolean;
  outline: ModuleCatalogArtifactOutlineSection[];
  /** rendererKey configured at catalog scope — confirmed workbook needs an Attempt. */
  workbookSupported: boolean;
  workbookFormat: WorkbookFormat | null;
}

export interface ModuleCatalogEntry {
  moduleKey: string;
  sequenceIndex: number;
  title: string;
  subtitle: string | null;
  description: string | null;
  objective: string | null;
  moduleType: ModuleType;
  completionMode: ModuleCompletionMode;
  estimatedMinutes: number | null;
  catalogStatus: ModuleCatalogStatus;
  expectedArtifacts: ModuleCatalogArtifact[];
}
