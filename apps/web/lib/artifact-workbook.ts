import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { renderArtifactWorkbook } from "@ai-catalyst/services/artifact";

import { getModuleContextByKey } from "./run-modules";

export type FounderArtifactWorkbook = {
  buffer: Buffer;
  mimeType: string;
  filename: string;
};

/**
 * Builds an on-demand workbook (fillable PDF) for the Founder's active Run
 * — see operational-workbooks plan §9. Resolves the attemptId the same way
 * getFounderArtifactDocument does; unlike that function, a business-rule
 * failure inside renderArtifactWorkbook (no renderer configured, source not
 * confirmed yet, integrity failure, render failure) is NOT swallowed to
 * null here — the caller (the download route) maps those ServiceErrors to
 * their own HTTP status via serviceErrorResponse, since each one is a
 * distinct, meaningful state the Founder or a support engineer needs to
 * see, not an interchangeable "not found".
 *
 * Kept in its own module (not lib/artifacts.ts) so artefact detail / module
 * pages that only load Markdown documents do not pull the workbook render
 * path into their server graph.
 */
export async function getFounderArtifactWorkbook(
  actor: ActorContext,
  moduleKey: string,
  artifactKey: string,
  sectionCount?: number,
): Promise<FounderArtifactWorkbook | null> {
  const context = await getModuleContextByKey(actor, moduleKey);
  if (!context) {
    return null;
  }

  const attemptId =
    context.displayAttempt?.id ?? context.activeAttempt?.id ?? null;
  if (!attemptId) {
    return null;
  }

  return renderArtifactWorkbook(actor, {
    attemptId,
    artifactKey,
    sectionCount,
  });
}
