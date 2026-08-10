import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import { parseEntityIdOrNotFound } from "@ai-catalyst/services/internal/entity-id";
import { getGeneratedTextContent } from "@ai-catalyst/services/storage";
import { sha256 } from "@ai-catalyst/services/storage/internal/hash";

import type { ArtifactServiceDependencies } from "@ai-catalyst/services/artifact/internal/dependencies";
import { resolveAttemptContextForFounder } from "@ai-catalyst/services/artifact/internal/attempt-context";
import {
  loadArtifactDefinitionByKey,
  loadLatestSubmission,
} from "@ai-catalyst/services/artifact/internal/submission-load";
import type { QueryExecutor } from "@ai-catalyst/services/artifact/internal/transaction";
import type {
  Provenance,
  WorkbookRenderOptions,
} from "@ai-catalyst/services/artifact/internal/renderers/types";

async function loadProgramVersionNumber(
  executor: QueryExecutor,
  programRunId: string,
): Promise<number> {
  const result = await executor.query<{ version_number: number }>(
    `select pv.version_number
     from program_runs pr
     join program_versions pv on pv.id = pr.program_version_id
     where pr.id = $1`,
    [programRunId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new ServiceError(
      "INTERNAL_INVARIANT_ERROR",
      `program_run ${programRunId} has no resolvable program_version.`,
    );
  }
  return row.version_number;
}

export interface RenderArtifactWorkbookInput {
  attemptId: string;
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
 * Builds an on-demand, never-stored fillable workbook from a confirmed submission.
 * Requires renderer_key, submitted (not draft) source, and checksum match against stored bytes.
 */
export async function renderArtifactWorkbook(
  actor: ActorContext,
  input: RenderArtifactWorkbookInput,
  deps: ArtifactServiceDependencies = {},
): Promise<RenderedWorkbook> {
  assertRole(actor, ["founder"]);
  const attemptId = parseEntityIdOrNotFound(
    input.attemptId,
    "Attempt not found.",
  );
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

  const context = await resolveAttemptContextForFounder(
    actor,
    attemptId,
    pool,
    {
      forUpdate: false,
    },
  );
  const artifactDefinition = await loadArtifactDefinitionByKey(
    pool,
    context.runModule.module_definition_id,
    input.artifactKey,
  );
  if (!artifactDefinition.renderer_key) {
    throw new ServiceError(
      "WORKBOOK_RENDERER_NOT_CONFIGURED",
      `Artifact "${input.artifactKey}" has no workbook renderer configured.`,
    );
  }

  const submission = await loadLatestSubmission(
    pool,
    attemptId,
    artifactDefinition.id,
    {
      forUpdate: false,
    },
  );
  if (
    !submission ||
    submission.status !== "submitted" ||
    !submission.primary_storage_object_id ||
    !submission.content_sha256
  ) {
    throw new ServiceError(
      "WORKBOOK_SOURCE_NOT_CONFIRMED",
      `Artifact "${input.artifactKey}" has no confirmed submission to build a workbook from.`,
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

  // Dynamic import keeps pdf-lib/fontkit off the artifact barrel for non-workbook paths.
  const { resolveWorkbookRenderer } =
    await import("@ai-catalyst/services/artifact/internal/renderers/registry");
  const renderer = resolveWorkbookRenderer(
    artifactDefinition.renderer_key,
    deps.renderers,
  );
  const programVersionNumber = await loadProgramVersionNumber(
    pool,
    context.runModule.program_run_id,
  );

  const provenance: Provenance = {
    sourceArtifactId: artifactDefinition.artifact_key,
    sourceArtifactVersion: submission.version_number,
    sourceContentHash: computedHash,
    rendererKey: renderer.rendererKey,
    rendererVersion: renderer.rendererVersion,
    generatedAt: new Date().toISOString(),
    workspaceId: context.workspaceId,
    programRunId: context.runModule.program_run_id,
    programVersionNumber,
  };
  const options: WorkbookRenderOptions | undefined =
    input.sectionCount !== undefined
      ? { sectionCount: input.sectionCount }
      : undefined;

  // Render failures surface as WORKBOOK_RENDER_FAILED, distinct from config/not-ready errors.
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
