import { NextResponse } from "next/server";

// Shared by the Founder and Mentor artefact-download routes
// (app/(app)/artefacts/[moduleKey]/[artifactKey]/download/route.ts and
// app/(app)/founders/[workspaceId]/artefacts/[moduleKey]/[artifactKey]/download/route.ts)
// — same format contract, same filename and response-shape rules. Each
// route keeps its own actor resolution and data-access calls; only the
// format/filename/response plumbing lives here.

export const EXPORT_FORMATS = ["docx", "xlsx"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export function isExportFormat(value: string): value is ExportFormat {
  return (EXPORT_FORMATS as readonly string[]).includes(value);
}

export type DownloadFormat = "source" | "workbook" | ExportFormat;

// Default stays "source" — every existing link, artefact-card.tsx and
// document-preview.tsx depend on it. Never falls back to Markdown on a bad
// or unrecognised `format`: silently returning a .md to someone who asked
// for a workbook is worse than an error (operational-workbooks plan §9).
export function parseDownloadFormat(raw: string | null): DownloadFormat | null {
  const format = raw ?? "source";
  if (format === "source" || format === "workbook" || isExportFormat(format)) {
    return format;
  }
  return null;
}

/** `null` means present but invalid; `undefined` means the param was omitted. */
export function parseSectionCount(
  sectionsParam: string | null,
): number | undefined | null {
  if (sectionsParam === null) {
    return undefined;
  }
  const parsed = Number(sectionsParam);
  if (!Number.isInteger(parsed) || parsed < 5 || parsed > 10) {
    return null;
  }
  return parsed;
}

export function safeFilename(name: string, fallback: string): string {
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
export function withExtension(name: string, extension: string): string {
  const withoutExtension = name.replace(/\.[^./\\]+$/, "");
  return `${withoutExtension}.${extension}`;
}

export function validationErrorResponse(message: string): NextResponse {
  return NextResponse.json(
    { error: { code: "VALIDATION_ERROR", message } },
    { status: 400 },
  );
}

export function artefactNotFoundResponse(): NextResponse {
  return NextResponse.json(
    { error: { code: "NOT_FOUND", message: "Artefact not found." } },
    { status: 404 },
  );
}

export function attachmentResponse(
  body: BodyInit,
  contentType: string,
  filename: string,
): NextResponse {
  return new NextResponse(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
