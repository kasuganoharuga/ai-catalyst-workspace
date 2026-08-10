import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { renderArtifactWorkbook } from "@ai-catalyst/services/artifact";

import { getModuleContextByKey } from "./run-modules";

export type FounderArtifactWorkbook = {
  buffer: Buffer;
  mimeType: string;
  filename: string;
};

/**
 * On-demand fillable PDF for the founder's active run.
 *
 * Business-rule failures propagate to the download route (not swallowed to null).
 * Separate from lib/artifacts.ts so Markdown-only pages avoid the render path.
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
