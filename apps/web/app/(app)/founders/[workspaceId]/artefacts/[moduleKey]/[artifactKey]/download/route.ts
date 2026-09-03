import {
  artefactNotFoundResponse,
  attachmentResponse,
  isExportFormat,
  parseDownloadFormat,
  parseSectionCount,
  safeFilename,
  validationErrorResponse,
  withExtension,
} from "@/app/(app)/artefacts/lib/artefact-download";
import { getCurrentMentorActor } from "@/lib/current-mentor-actor";
import { getMentorArtefactDocument } from "@/lib/mentor";
import { getMentorArtifactExport } from "@/lib/mentor-export";
import { getMentorArtifactWorkbook } from "@/lib/mentor-workbook";
import { serviceErrorResponse } from "@/lib/service-error-response";

// Mentor-side counterpart to the Founder download route
// (app/(app)/artefacts/[moduleKey]/[artifactKey]/download/route.ts) — same
// format contract (source | workbook | docx | xlsx), same default-to-source
// and "never fall back to Markdown on an unrecognised format" discipline,
// resolved via Workspace + moduleKey rather than an attemptId. Read-only,
// same as every other Mentor route: this never advances or touches Founder
// progress.

type DownloadRouteContext = {
  params: Promise<{
    workspaceId: string;
    moduleKey: string;
    artifactKey: string;
  }>;
};

export async function GET(request: Request, context: DownloadRouteContext) {
  try {
    const { workspaceId, moduleKey, artifactKey } = await context.params;
    const searchParams = new URL(request.url).searchParams;
    const format = parseDownloadFormat(searchParams.get("format"));
    if (format === null) {
      return validationErrorResponse(
        'format must be "source", "workbook", "docx", or "xlsx".',
      );
    }

    const actor = await getCurrentMentorActor();

    if (format === "source") {
      const document = await getMentorArtefactDocument(
        actor,
        workspaceId,
        moduleKey,
        artifactKey,
      );
      if (!document) {
        return artefactNotFoundResponse();
      }

      const filename = safeFilename(
        document.requiredFilename ?? `${document.artifactKey}.md`,
        "artefact.md",
      );
      return attachmentResponse(
        document.content,
        "text/markdown; charset=utf-8",
        filename,
      );
    }

    if (isExportFormat(format)) {
      // getMentorArtifactExport never resolves to null/undefined — business-
      // rule failures propagate as thrown errors instead (see its JSDoc),
      // unlike the Founder route's getFounderArtifactExport. No `if
      // (!exported)` guard here is deliberate, not an oversight.
      const exported = await getMentorArtifactExport(
        actor,
        workspaceId,
        moduleKey,
        artifactKey,
        format,
      );
      const filename = safeFilename(
        withExtension(
          exported.requiredFilename ?? `${artifactKey}.md`,
          exported.extension,
        ),
        `artefact.${exported.extension}`,
      );
      return attachmentResponse(
        new Uint8Array(exported.buffer),
        exported.mimeType,
        filename,
      );
    }

    const sectionCount = parseSectionCount(searchParams.get("sections"));
    if (sectionCount === null) {
      return validationErrorResponse(
        "sections must be an integer between 5 and 10.",
      );
    }

    // Same deliberate no-null-guard as the export branch above:
    // getMentorArtifactWorkbook never resolves to null/undefined either.
    const workbook = await getMentorArtifactWorkbook(
      actor,
      workspaceId,
      moduleKey,
      artifactKey,
      sectionCount,
    );
    const filename = safeFilename(workbook.filename, "artefact.pdf");
    return attachmentResponse(
      new Uint8Array(workbook.buffer),
      workbook.mimeType,
      filename,
    );
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
