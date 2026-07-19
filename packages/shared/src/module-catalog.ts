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

export interface ModuleCatalogArtifact {
  artifactKey: string;
  name: string;
  requiredFilename: string | null;
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
