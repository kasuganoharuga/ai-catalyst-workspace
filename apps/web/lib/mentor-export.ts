import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import {
  exportMentorArtifactDocument,
  type DocumentExportFormat,
} from "@ai-catalyst/services/mentor/export-document";

export type { DocumentExportFormat } from "@ai-catalyst/services/mentor/export-document";

export type MentorArtifactExport = {
  buffer: Buffer;
  mimeType: string;
  extension: string;
  requiredFilename: string | null;
};

/**
 * Mentor-side counterpart to lib/artifact-export.ts. Thin pass-through —
 * unlike the Founder path there is no attemptId to resolve first, the
 * service already takes Workspace + moduleKey + artifactKey directly (same
 * shape as getMentorArtefactDocument in lib/mentor.ts) — kept as its own
 * helper anyway so the download route stays a one-call thin shell.
 */
export async function getMentorArtifactExport(
  actor: ActorContext,
  workspaceId: string,
  moduleKey: string,
  artifactKey: string,
  format: DocumentExportFormat,
): Promise<MentorArtifactExport> {
  return exportMentorArtifactDocument(actor, {
    workspaceId,
    moduleKey,
    artifactKey,
    format,
  });
}
