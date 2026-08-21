import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import { loadProgramVersionNumber } from "@ai-catalyst/services/artifact/internal/program-version";
import type {
  Provenance,
  WorkbookRenderOptions,
} from "@ai-catalyst/services/artifact/internal/renderers/types";
import { parseEntityIdOrNotFound } from "@ai-catalyst/services/internal/entity-id";
import { resolveWorkspaceRunContext } from "@ai-catalyst/services/internal/run-module";
import { assertMentorOwnsWorkspace } from "@ai-catalyst/services/mentor";
import { resolveMentorArtifactSubmission } from "@ai-catalyst/services/mentor/internal/resolve-submission";
import { getGeneratedTextContent } from "@ai-catalyst/services/storage";
import { sha256 } from "@ai-catalyst/services/storage/internal/hash";

export interface RenderMentorArtifactWorkbookInput {
  workspaceId: string;
  moduleKey: string;
  artifactKey: string;
  /** Founder-chosen interview round length (5–10); ignored by renderers that do not read it. */
  sectionCount?: number;
}

export interface RenderedWorkbook {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}

/**
 * Mentor-side counterpart to renderArtifactWorkbook (../artifact/render-workbook.ts)
 * — same renderer registry, same checksum verification, but resolved via
 * Workspace + moduleKey (mentor/index.ts's shape) rather than an attemptId,
 * and read-only: it never advances or touches Founder progress.
 */
export async function renderMentorArtifactWorkbook(
  actor: ActorContext,
  input: RenderMentorArtifactWorkbookInput,
): Promise<RenderedWorkbook> {
  assertRole(actor, ["mentor"]);
  const workspaceId = parseEntityIdOrNotFound(
    input.workspaceId,
    "Founder not found.",
  );
  await assertMentorOwnsWorkspace(actor, workspaceId);

  if (
    input.sectionCount !== undefined &&
    (!Number.isInteger(input.sectionCount) ||
      input.sectionCount < 5 ||
      input.sectionCount > 10)
  ) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "sectionCount must be an integer between 5 and 10.",
    );
  }

  const run = await resolveWorkspaceRunContext(workspaceId);
  if (!run) {
    throw new ServiceError(
      "WORKBOOK_SOURCE_NOT_CONFIRMED",
      `Artifact "${input.artifactKey}" has no confirmed submission to build a workbook from.`,
    );
  }

  const row = await resolveMentorArtifactSubmission(
    run.activeBranchId,
    input.moduleKey,
    input.artifactKey,
  );
  if (!row?.renderer_key) {
    throw new ServiceError(
      "WORKBOOK_RENDERER_NOT_CONFIGURED",
      `Artifact "${input.artifactKey}" has no workbook renderer configured.`,
    );
  }
  if (!row.primary_storage_object_id || !row.content_sha256) {
    throw new ServiceError(
      "WORKBOOK_SOURCE_NOT_CONFIRMED",
      `Artifact "${input.artifactKey}" has no confirmed submission to build a workbook from.`,
    );
  }

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

  // Dynamic import keeps pdf-lib/fontkit off the mentor barrel for non-workbook paths.
  const { resolveWorkbookRenderer } =
    await import("@ai-catalyst/services/artifact/internal/renderers/registry");
  const renderer = resolveWorkbookRenderer(row.renderer_key);
  const programVersionNumber = await loadProgramVersionNumber(
    pool,
    row.program_run_id,
  );

  const provenance: Provenance = {
    sourceArtifactId: row.artifact_key,
    sourceArtifactVersion: row.version_number,
    sourceContentHash: computedHash,
    rendererKey: renderer.rendererKey,
    rendererVersion: renderer.rendererVersion,
    generatedAt: new Date().toISOString(),
    workspaceId,
    programRunId: row.program_run_id,
    programVersionNumber,
  };
  const options: WorkbookRenderOptions | undefined =
    input.sectionCount !== undefined
      ? { sectionCount: input.sectionCount }
      : undefined;

  try {
    const { buffer } = await renderer.build(markdown, provenance, options);
    return {
      buffer,
      mimeType: renderer.mimeType,
      filename: renderer.downloadFilename,
    };
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new ServiceError("WORKBOOK_RENDER_FAILED", message);
  }
}
