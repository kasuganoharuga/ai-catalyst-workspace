import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import {
  exportArtifactDocument,
  type DocumentExportFormat,
} from "@ai-catalyst/services/artifact";

import { getModuleContextByKey } from "./run-modules";

export type { DocumentExportFormat } from "@ai-catalyst/services/artifact";

export type FounderArtifactExport = {
  buffer: Buffer;
  mimeType: string;
  extension: string;
  requiredFilename: string | null;
};

/**
 * On-demand docx/xlsx export for the founder's active run — the Word/Excel
 * sibling of getFounderArtifactWorkbook's PDF. Business-rule failures
 * (no confirmed submission, no table for xlsx, checksum mismatch) propagate
 * to the download route rather than being swallowed to null, same
 * convention as the workbook path.
 */
export async function getFounderArtifactExport(
  actor: ActorContext,
  moduleKey: string,
  artifactKey: string,
  format: DocumentExportFormat,
): Promise<FounderArtifactExport | null> {
  const context = await getModuleContextByKey(actor, moduleKey);
  if (!context) {
    return null;
  }

  const attemptId =
    context.displayAttempt?.id ?? context.activeAttempt?.id ?? null;
  if (!attemptId) {
    return null;
  }

  return exportArtifactDocument(actor, { attemptId, artifactKey, format });
}
