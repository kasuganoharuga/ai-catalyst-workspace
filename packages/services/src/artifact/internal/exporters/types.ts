// Shared contract for document exporters (markdown → docx/xlsx).
//
// Distinct from ../renderers/: a renderer expands one confirmed Markdown
// record into a differently-structured document (interview guide → 5
// fillable sections) keyed by artifact_definitions.renderer_key, one
// renderer per artefact. An exporter is generic format conversion — any
// artefact's Markdown, unmodified in structure, into Word or Excel — so it
// is keyed by format alone, never by artifact. See
// docs/product/operational-workbooks.md §1 for why that distinction is not
// cosmetic.
//
// Provenance is the same type renderers stamp into PDF Info dictionaries
// (../renderers/types.ts) — reused as-is rather than duplicated; `rendererKey`
// / `rendererVersion` here carry the exporter's own key/version.

export type { Provenance } from "@ai-catalyst/services/artifact/internal/renderers/types";
import type { Provenance } from "@ai-catalyst/services/artifact/internal/renderers/types";

export type DocumentExportFormat = "docx" | "xlsx";

export interface DocumentExporter {
  format: DocumentExportFormat;
  exporterVersion: string;
  mimeType: string;
  extension: string;
  /**
   * `null` when this exporter cannot produce output for this document (e.g.
   * xlsx with no tables) — callers turn that into ARTIFACT_HAS_NO_TABLES.
   * Never a silent fallback to an empty file.
   */
  export(markdown: string, provenance: Provenance): Promise<Buffer | null>;
}
