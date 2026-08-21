import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import type { DocumentExportFormat } from "@ai-catalyst/services/artifact/internal/exporters/types";
import { artifactMarkdownHasTables } from "@ai-catalyst/services/artifact/internal/markdown-sections";
import { loadProgramVersionNumber } from "@ai-catalyst/services/artifact/internal/program-version";
import type { Provenance } from "@ai-catalyst/services/artifact/internal/renderers/types";
import { parseEntityIdOrNotFound } from "@ai-catalyst/services/internal/entity-id";
import { resolveWorkspaceRunContext } from "@ai-catalyst/services/internal/run-module";
import { assertMentorOwnsWorkspace } from "@ai-catalyst/services/mentor";
import { resolveMentorArtifactSubmission } from "@ai-catalyst/services/mentor/internal/resolve-submission";
import { getGeneratedTextContent } from "@ai-catalyst/services/storage";
import { sha256 } from "@ai-catalyst/services/storage/internal/hash";

export type { DocumentExportFormat } from "@ai-catalyst/services/artifact/internal/exporters/types";

export interface ExportMentorArtifactDocumentInput {
  workspaceId: string;
  moduleKey: string;
  artifactKey: string;
  format: DocumentExportFormat;
}

export interface ExportedArtifactDocument {
  buffer: Buffer;
  mimeType: string;
  extension: string;
  requiredFilename: string | null;
}

/**
 * Mentor-side counterpart to exportArtifactDocument (../artifact/export-document.ts)
 * — same docx/xlsx exporters, same checksum verification, but resolved via
 * Workspace + moduleKey (mentor/index.ts's shape) rather than an attemptId,
 * and read-only: it never advances or touches Founder progress.
 */
export async function exportMentorArtifactDocument(
  actor: ActorContext,
  input: ExportMentorArtifactDocumentInput,
): Promise<ExportedArtifactDocument> {
  assertRole(actor, ["mentor"]);
  const workspaceId = parseEntityIdOrNotFound(
    input.workspaceId,
    "Founder not found.",
  );
  await assertMentorOwnsWorkspace(actor, workspaceId);

  const run = await resolveWorkspaceRunContext(workspaceId);
  if (!run) {
    throw new ServiceError(
      "WORKBOOK_SOURCE_NOT_CONFIRMED",
      `Artifact "${input.artifactKey}" has no confirmed submission to export.`,
    );
  }

  const row = await resolveMentorArtifactSubmission(
    run.activeBranchId,
    input.moduleKey,
    input.artifactKey,
  );
  if (!row?.primary_storage_object_id || !row.content_sha256) {
    throw new ServiceError(
      "WORKBOOK_SOURCE_NOT_CONFIRMED",
      `Artifact "${input.artifactKey}" has no confirmed submission to export.`,
    );
  }

  // getGeneratedTextContent independently re-checks Mentor scope for this
  // Workspace — the same choke point official validation and the Founder
  // path both go through.
  const markdown = await getGeneratedTextContent(
    actor,
    row.primary_storage_object_id,
  );
  const computedHash = sha256(Buffer.from(markdown, "utf8"));
  if (computedHash !== row.content_sha256) {
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

  // Dynamic import keeps docx/write-excel-file off the mentor barrel for
  // non-export paths — same reasoning as artifact/export-document.ts.
  const { resolveDocumentExporter } =
    await import("@ai-catalyst/services/artifact/internal/exporters/registry");
  const exporter = resolveDocumentExporter(input.format);
  const programVersionNumber = await loadProgramVersionNumber(
    pool,
    row.program_run_id,
  );

  const provenance: Provenance = {
    sourceArtifactId: row.artifact_key,
    sourceArtifactVersion: row.version_number,
    sourceContentHash: computedHash,
    rendererKey: `markdown_${exporter.format}_v${exporter.exporterVersion}`,
    rendererVersion: exporter.exporterVersion,
    generatedAt: new Date().toISOString(),
    workspaceId,
    programRunId: row.program_run_id,
    programVersionNumber,
  };

  let buffer: Buffer | null;
  try {
    buffer = await exporter.export(markdown, provenance);
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new ServiceError("WORKBOOK_RENDER_FAILED", message);
  }

  if (buffer === null) {
    throw new ServiceError(
      "INTERNAL_INVARIANT_ERROR",
      `DocumentExporter "${exporter.format}" returned null despite passing its own availability check.`,
    );
  }

  return {
    buffer,
    mimeType: exporter.mimeType,
    extension: exporter.extension,
    requiredFilename: row.required_filename,
  };
}
