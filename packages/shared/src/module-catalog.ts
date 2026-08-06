// Single source of truth for the Founder-facing Module catalog DTO, shared
// by packages/services (producer) and apps/web (consumer) so the two never
// drift into two separate shapes for the same data.

export type ModuleCatalogStatus = "live" | "coming_soon";

export type ModuleType = "setup" | "standard" | "review" | "completion";

export type ModuleCompletionMode =
  | "artifact"
  | "confirmation"
  | "artifact_and_confirmation"
  | "system";

/**
 * Section checklist for an expected artefact, derived from ## headings in
 * the Artifact Definition's `output_config.templateMarkdown`. `items` is
 * reserved for a denser outline later; V1 keeps it empty.
 */
export interface ModuleCatalogArtifactOutlineSection {
  heading: string;
  items: string[];
}

export interface ModuleCatalogArtifact {
  artifactKey: string;
  name: string;
  requiredFilename: string | null;
  /**
   * False for supporting artefacts a Module accepts but never blocks on (e.g.
   * Module 4's interview notes). Carried here so the pre-run catalog preview
   * can say "optional" instead of assuming everything is required.
   */
  isRequired: boolean;
  outline: ModuleCatalogArtifactOutlineSection[];
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
