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
import { getFounderArtifactExport } from "@/lib/artifact-export";
import { getFounderArtifactWorkbook } from "@/lib/artifact-workbook";
import { getFounderArtifactDocument } from "@/lib/artifacts";
import { getCurrentFounderActor } from "@/lib/current-founder-actor";
import { serviceErrorResponse } from "@/lib/service-error-response";

type DownloadRouteContext = {
  params: Promise<{ moduleKey: string; artifactKey: string }>;
};

export async function GET(request: Request, context: DownloadRouteContext) {
  try {
    const { moduleKey, artifactKey } = await context.params;
    const searchParams = new URL(request.url).searchParams;
    const format = parseDownloadFormat(searchParams.get("format"));
    if (format === null) {
      return validationErrorResponse(
        'format must be "source", "workbook", "docx", or "xlsx".',
      );
    }

    const actor = await getCurrentFounderActor();

    if (isExportFormat(format)) {
      const exported = await getFounderArtifactExport(
        actor,
        moduleKey,
        artifactKey,
        format,
      );
      if (!exported) {
        return artefactNotFoundResponse();
      }

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

    if (format === "workbook") {
      const sectionCount = parseSectionCount(searchParams.get("sections"));
      if (sectionCount === null) {
        return validationErrorResponse(
          "sections must be an integer between 5 and 10.",
        );
      }

      const workbook = await getFounderArtifactWorkbook(
        actor,
        moduleKey,
        artifactKey,
        sectionCount,
      );
      if (!workbook) {
        return artefactNotFoundResponse();
      }

      const filename = safeFilename(workbook.filename, "artefact.pdf");
      // Buffer<ArrayBufferLike> doesn't structurally satisfy NextResponse's
      // BodyInit under this project's @types/node; a plain Uint8Array view
      // over the same bytes does.
      return attachmentResponse(
        new Uint8Array(workbook.buffer),
        workbook.mimeType,
        filename,
      );
    }

    const document = await getFounderArtifactDocument(
      actor,
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
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
