// Document exporter registry — mirrors ../renderers/registry.ts's shape
// (a plain lookup keyed by format, INTERNAL_INVARIANT_ERROR when
// unregistered) but keyed by DocumentExportFormat rather than
// artifact_definitions.renderer_key, since export is format conversion, not
// a per-artefact renderer (see ./types.ts).

import { ServiceError } from "@ai-catalyst/services/errors";

import { markdownDocxV1 } from "@ai-catalyst/services/artifact/internal/exporters/markdown-docx-v1";
import { markdownTablesXlsxV1 } from "@ai-catalyst/services/artifact/internal/exporters/markdown-tables-xlsx-v1";
import type {
  DocumentExportFormat,
  DocumentExporter,
} from "@ai-catalyst/services/artifact/internal/exporters/types";

export type {
  DocumentExportFormat,
  DocumentExporter,
} from "@ai-catalyst/services/artifact/internal/exporters/types";

const DOCUMENT_EXPORTERS: Record<DocumentExportFormat, DocumentExporter> = {
  docx: markdownDocxV1,
  xlsx: markdownTablesXlsxV1,
};

/** Throws INTERNAL_INVARIANT_ERROR when unregistered — a deployment mismatch, never a caller error (every valid format is registered above). */
export function resolveDocumentExporter(
  format: DocumentExportFormat,
): DocumentExporter {
  const exporter = DOCUMENT_EXPORTERS[format];
  if (!exporter) {
    throw new ServiceError(
      "INTERNAL_INVARIANT_ERROR",
      `No DocumentExporter is registered for format "${format}".`,
    );
  }
  return exporter;
}
