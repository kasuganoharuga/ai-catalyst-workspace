import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import { parseEntityIdOrNotFound } from "@ai-catalyst/services/internal/entity-id";
import { getGeneratedTextContent } from "@ai-catalyst/services/storage";
import { sha256 } from "@ai-catalyst/services/storage/internal/hash";

import { resolveAttemptContextForFounder } from "@ai-catalyst/services/artifact/internal/attempt-context";
import type { DocumentExportFormat } from "@ai-catalyst/services/artifact/internal/exporters/types";
import { artifactMarkdownHasTables } from "@ai-catalyst/services/artifact/internal/markdown-sections";
import { loadProgramVersionNumber } from "@ai-catalyst/services/artifact/internal/program-version";
import {
  loadArtifactDefinitionByKey,
  loadLatestSubmission,
} from "@ai-catalyst/services/artifact/internal/submission-load";
import type { Provenance } from "@ai-catalyst/services/artifact/internal/renderers/types";

export type { DocumentExportFormat } from "@ai-catalyst/services/artifact/internal/exporters/types";
// The UI-facing "does this document have anything to export to Excel"
// check — re-exported here (a public, non-internal path) rather than left
// only under internal/, since apps/web needs it to decide whether to show
// the Excel menu item without importing an internal path. Sourced from
// markdown-sections (no exporter dependency) rather than the exporters
// registry — see the dynamic import below for why the registry itself
// must stay off this file's eager import graph.
export { artifactMarkdownHasTables } from "@ai-catalyst/services/artifact/internal/markdown-sections";

export interface ExportArtifactDocumentInput {
  attemptId: string;
  artifactKey: string;
  format: DocumentExportFormat;
}

export interface ExportedArtifactDocument {
  buffer: Buffer;
  mimeType: string;
  extension: string;
  /** Source Markdown's required_filename, for the route to derive a download name (swap extension) — export has no renderer-fixed filename of its own. */
  requiredFilename: string | null;
}

/**
 * On-demand, never-stored docx/xlsx export of a confirmed Artifact
 * submission — the docx/xlsx sibling of renderArtifactWorkbook (same
 * submitted-only source requirement, same checksum verification against
 * stored bytes). Export is a format conversion of the same confirmed
 * record, not a looser read path.
 */
export async function exportArtifactDocument(
  actor: ActorContext,
  input: ExportArtifactDocumentInput,
): Promise<ExportedArtifactDocument> {
  assertRole(actor, ["founder"]);
  const attemptId = parseEntityIdOrNotFound(
    input.attemptId,
    "Attempt not found.",
  );

  const context = await resolveAttemptContextForFounder(
    actor,
    attemptId,
    pool,
    { forUpdate: false },
  );
  const artifactDefinition = await loadArtifactDefinitionByKey(
    pool,
    context.runModule.module_definition_id,
    input.artifactKey,
  );

  const submission = await loadLatestSubmission(
    pool,
    attemptId,
    artifactDefinition.id,
    { forUpdate: false },
  );
  if (
    !submission ||
    submission.status !== "submitted" ||
    !submission.primary_storage_object_id ||
    !submission.content_sha256
  ) {
    throw new ServiceError(
      "WORKBOOK_SOURCE_NOT_CONFIRMED",
      `Artifact "${input.artifactKey}" has no confirmed submission to export.`,
    );
  }

  const markdown = await getGeneratedTextContent(
    actor,
    submission.primary_storage_object_id,
  );
  const computedHash = sha256(Buffer.from(markdown, "utf8"));
  if (computedHash !== submission.content_sha256) {
    throw new ServiceError(
      "WORKBOOK_SOURCE_INTEGRITY_FAILED",
      `Stored bytes for artifact "${input.artifactKey}" no longer match their recorded checksum.`,
    );
  }

  if (input.format === "xlsx" && !artifactMarkdownHasTables(markdown)) {
    throw new ServiceError(
      "ARTIFACT_HAS_NO_TABLES",
      `Artifact "${input.artifactKey}" has no table to export to Excel.`,
    );
  }

  // Dynamic import keeps docx/write-excel-file off the artifact barrel for
  // non-export paths — same reasoning as render-workbook.ts's dynamic
  // import of the renderer registry for pdf-lib/fontkit.
  const { resolveDocumentExporter } =
    await import("@ai-catalyst/services/artifact/internal/exporters/registry");
  const exporter = resolveDocumentExporter(input.format);
  const programVersionNumber = await loadProgramVersionNumber(
    pool,
    context.runModule.program_run_id,
  );

  const provenance: Provenance = {
    sourceArtifactId: artifactDefinition.artifact_key,
    sourceArtifactVersion: submission.version_number,
    sourceContentHash: computedHash,
    rendererKey: `markdown_${exporter.format}_v${exporter.exporterVersion}`,
    rendererVersion: exporter.exporterVersion,
    generatedAt: new Date().toISOString(),
    workspaceId: context.workspaceId,
    programRunId: context.runModule.program_run_id,
    programVersionNumber,
  };

  // Export failures surface as WORKBOOK_RENDER_FAILED, distinct from
  // config/not-ready errors — same convention as renderArtifactWorkbook.
  let buffer: Buffer | null;
  try {
    buffer = await exporter.export(markdown, provenance);
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new ServiceError("WORKBOOK_RENDER_FAILED", message);
  }

  if (buffer === null) {
    // The upfront artifactMarkdownHasTables check already catches this for
    // xlsx — reaching here would mean the exporter and the check disagreed,
    // which is a content/exporter bug, not a normal "no tables" outcome.
    throw new ServiceError(
      "INTERNAL_INVARIANT_ERROR",
      `DocumentExporter "${exporter.format}" returned null despite passing its own availability check.`,
    );
  }

  return {
    buffer,
    mimeType: exporter.mimeType,
    extension: exporter.extension,
    requiredFilename: artifactDefinition.required_filename,
  };
}
