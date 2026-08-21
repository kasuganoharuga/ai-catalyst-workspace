import { NextResponse } from "next/server";

import { getFounderArtifactExport } from "@/lib/artifact-export";
import { getFounderArtifactWorkbook } from "@/lib/artifact-workbook";
import { getFounderArtifactDocument } from "@/lib/artifacts";
import { getCurrentFounderActor } from "@/lib/current-founder-actor";
import { serviceErrorResponse } from "@/lib/service-error-response";

type DownloadRouteContext = {
  params: Promise<{ moduleKey: string; artifactKey: string }>;
};

const EXPORT_FORMATS = ["docx", "xlsx"] as const;
type ExportFormat = (typeof EXPORT_FORMATS)[number];

function isExportFormat(value: string): value is ExportFormat {
  return (EXPORT_FORMATS as readonly string[]).includes(value);
}

function safeFilename(name: string, fallback: string): string {
  // Australian spelling: this lands in the founder's downloads folder.
  // The `artifact*` identifiers around it are DTO field names, not copy.
  const cleaned = name.replace(/[\\/:*?"<>|]+/g, "_").trim();
  return cleaned.length > 0 ? cleaned : fallback;
}

// "Ideal-Customer-Avatar.md" -> "Ideal-Customer-Avatar.docx" — export has no
// per-artefact fixed filename (renderer.downloadFilename) the way the PDF
// workbook does, since it is generic format conversion, not a renderer
// (see packages/services/.../exporters/types.ts); the source filename is
// the closest thing to a stable display name, so we swap its extension.
function withExtension(name: string, extension: string): string {
  const withoutExtension = name.replace(/\.[^./\\]+$/, "");
  return `${withoutExtension}.${extension}`;
}

function validationErrorResponse(message: string): NextResponse {
  return NextResponse.json(
    { error: { code: "VALIDATION_ERROR", message } },
    { status: 400 },
  );
}

// Default stays "source" — every existing link, artefact-card.tsx and
// document-preview.tsx depend on it. Never falls back to Markdown on a bad
// or unrecognised `format`: silently returning a .md to someone who asked
// for a workbook is worse than an error (operational-workbooks plan §9).
export async function GET(request: Request, context: DownloadRouteContext) {
  try {
    const { moduleKey, artifactKey } = await context.params;
    const searchParams = new URL(request.url).searchParams;
    const format = searchParams.get("format") ?? "source";
    if (
      format !== "source" &&
      format !== "workbook" &&
      !isExportFormat(format)
    ) {
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
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Artefact not found." } },
          { status: 404 },
        );
      }

      const filename = safeFilename(
        withExtension(
          exported.requiredFilename ?? `${artifactKey}.md`,
          exported.extension,
        ),
        `artefact.${exported.extension}`,
      );
      return new NextResponse(new Uint8Array(exported.buffer), {
        headers: {
          "Content-Type": exported.mimeType,
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "private, no-store",
        },
      });
    }

    if (format === "workbook") {
      const sectionsParam = searchParams.get("sections");
      let sectionCount: number | undefined;
      if (sectionsParam !== null) {
        const parsed = Number(sectionsParam);
        if (!Number.isInteger(parsed) || parsed < 5 || parsed > 10) {
          return validationErrorResponse(
            "sections must be an integer between 5 and 10.",
          );
        }
        sectionCount = parsed;
      }

      const workbook = await getFounderArtifactWorkbook(
        actor,
        moduleKey,
        artifactKey,
        sectionCount,
      );
      if (!workbook) {
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Artefact not found." } },
          { status: 404 },
        );
      }

      const filename = safeFilename(workbook.filename, "artefact.pdf");
      // Buffer<ArrayBufferLike> doesn't structurally satisfy NextResponse's
      // BodyInit under this project's @types/node; a plain Uint8Array view
      // over the same bytes does.
      return new NextResponse(new Uint8Array(workbook.buffer), {
        headers: {
          "Content-Type": workbook.mimeType,
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "private, no-store",
        },
      });
    }

    const document = await getFounderArtifactDocument(
      actor,
      moduleKey,
      artifactKey,
    );

    if (!document) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Artefact not found." } },
        { status: 404 },
      );
    }

    const filename = safeFilename(
      document.requiredFilename ?? `${document.artifactKey}.md`,
      "artefact.md",
    );

    return new NextResponse(document.content, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
