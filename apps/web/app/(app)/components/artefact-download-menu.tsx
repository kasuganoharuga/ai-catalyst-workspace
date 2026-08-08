"use client";

import { ChevronDown, Download, Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Download control for a saved artefact. When only Markdown exists, this is
 * a single plain link — a dropdown with one option would just be noise.
 *
 * When a PDF workbook is also available, the two formats are independent:
 * Markdown stays a plain `<a href>` (always works, never blocked by
 * anything), while PDF goes through `fetch` so a `WORKBOOK_RENDER_FAILED`
 * response (e.g. a field with a character outside the embedded font's
 * coverage) surfaces as an inline message next to the menu instead of the
 * browser navigating to a raw JSON error body — and so it can never affect
 * the Markdown option, which the previous two-separate-`<a>`-tags layout
 * technically already guaranteed but never actually surfaced a failure for
 * either.
 */
export function ArtefactDownloadMenu({
  downloadHref,
  workbookAvailable,
  size = "default",
  triggerVariant = "outline",
  singleVariant = "outline",
  downloadLabel = "Download",
  pdfLabel = "Download PDF",
  markdownLabel = "Markdown source",
}: {
  downloadHref: string;
  workbookAvailable: boolean;
  size?: "default" | "sm" | "lg";
  /** Variant of the single trigger button shown when a PDF option exists. */
  triggerVariant?: "default" | "outline" | "ghost";
  /** Variant of the lone Download link shown when no PDF option exists. */
  singleVariant?: "default" | "outline" | "ghost";
  downloadLabel?: string;
  pdfLabel?: string;
  markdownLabel?: string;
}) {
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  if (!workbookAvailable) {
    return (
      <Button asChild size={size} variant={singleVariant}>
        <a href={downloadHref}>
          <Download aria-hidden="true" />
          {downloadLabel}
        </a>
      </Button>
    );
  }

  async function downloadPdf() {
    setPdfError(null);
    setPdfLoading(true);
    try {
      const response = await fetch(`${downloadHref}?format=workbook`);
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(body?.error?.message ?? "Could not generate the PDF.");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filename =
        /filename="([^"]+)"/.exec(disposition)?.[1] ?? "document.pdf";
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setPdfError(
        error instanceof Error ? error.message : "Could not generate the PDF.",
      );
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size={size} variant={triggerVariant}>
            <Download aria-hidden="true" />
            {downloadLabel}
            <ChevronDown aria-hidden="true" className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            disabled={pdfLoading}
            onSelect={(event) => {
              event.preventDefault();
              void downloadPdf();
            }}
          >
            {pdfLoading ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : null}
            {pdfLabel}
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={downloadHref}>{markdownLabel}</a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {pdfError ? (
        <p className="max-w-xs text-xs leading-5 text-destructive">
          {pdfError} The Markdown version is still available above.
        </p>
      ) : null}
    </div>
  );
}
