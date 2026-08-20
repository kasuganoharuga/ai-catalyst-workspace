import type { RegisteredWorkbookRenderer } from "@ai-catalyst/services/artifact/internal/renderers/types";
import type { Validator } from "@ai-catalyst/services/artifact/internal/validators/types";

export interface ArtifactServiceDependencies {
  // Test-only DI seam (same pattern as ModuleCatalogDependencies/
  // StorageServiceDependencies) — lets artifact/index.db.test.ts register
  // a fixture Validator without touching the real content's own
  // registrations in internal/validators/registry.ts.
  validators?: Record<string, Validator>;
  // Same seam, for renderArtifactWorkbook — lets tests register a fixture
  // WorkbookRenderer without touching the real registrations in
  // internal/renderers/registry.ts.
  renderers?: Record<string, RegisteredWorkbookRenderer>;
}
