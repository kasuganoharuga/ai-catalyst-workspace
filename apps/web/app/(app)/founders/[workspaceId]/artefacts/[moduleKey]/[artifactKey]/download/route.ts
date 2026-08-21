import { NextResponse } from "next/server";

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

const EXPORT_FORMATS = ["docx", "xlsx"] as const;
type ExportFormat = (typeof EXPORT_FORMATS)[number];

function isExportFormat(value: string): value is ExportFormat {
  return (EXPORT_FORMATS as readonly string[]).includes(value);
}

function safeFilename(name: string, fallback: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]+/g, "_").trim();
  return cleaned.length > 0 ? cleaned : fallback;
}

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

export async function GET(request: Request, context: DownloadRouteContext) {
  try {
    const { workspaceId, moduleKey, artifactKey } = await context.params;
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

    const actor = await getCurrentMentorActor();

    if (format === "source") {
      const document = await getMentorArtefactDocument(
        actor,
        workspaceId,
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
    }

    if (isExportFormat(format)) {
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
      return new NextResponse(new Uint8Array(exported.buffer), {
        headers: {
          "Content-Type": exported.mimeType,
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "private, no-store",
        },
      });
    }

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

    const workbook = await getMentorArtifactWorkbook(
      actor,
      workspaceId,
      moduleKey,
      artifactKey,
      sectionCount,
    );
    const filename = safeFilename(workbook.filename, "artefact.pdf");
    return new NextResponse(new Uint8Array(workbook.buffer), {
      headers: {
        "Content-Type": workbook.mimeType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
