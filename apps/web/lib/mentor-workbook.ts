import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { renderMentorArtifactWorkbook } from "@ai-catalyst/services/mentor/render-workbook";

export type MentorArtifactWorkbook = {
  buffer: Buffer;
  mimeType: string;
  filename: string;
};

/**
 * Mentor-side counterpart to lib/artifact-workbook.ts. Thin pass-through —
 * kept as its own helper so the download route stays a one-call thin shell,
 * matching every other route/lib pairing in this app.
 */
export async function getMentorArtifactWorkbook(
  actor: ActorContext,
  workspaceId: string,
  moduleKey: string,
  artifactKey: string,
  sectionCount?: number,
): Promise<MentorArtifactWorkbook> {
  return renderMentorArtifactWorkbook(actor, {
    workspaceId,
    moduleKey,
    artifactKey,
    sectionCount,
  });
}
