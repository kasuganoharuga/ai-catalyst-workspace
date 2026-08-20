"use client";

import {
  ChevronDown,
  Download,
  FileDown,
  FileText,
  Loader2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { toastCopy } from "../lib/copy";

/**
 * Artefact download: plain link when Markdown-only; dropdown when PDF workbook exists.
 * PDF uses fetch so render failures surface as toasts instead of raw JSON.
 */
export function ArtefactDownloadMenu({
  downloadHref,
  workbookAvailable,
  size = "default",
  triggerVariant = "outline",
  singleVariant = "outline",
  downloadLabel = "Download Markdown",
  pdfLabel = "Download PDF",
  markdownLabel = "Download Markdown",
  className,
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
  className?: string;
}) {
  const [pdfLoading, setPdfLoading] = useState(false);

  if (!workbookAvailable) {
    return (
      <Button asChild size={size} variant={singleVariant} className={className}>
        <a href={downloadHref}>
          <Download aria-hidden="true" />
          {downloadLabel}
        </a>
      </Button>
    );
  }

  async function downloadPdf() {
    setPdfLoading(true);
    try {
      const response = await fetch(`${downloadHref}?format=workbook`);
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(
          body?.error?.message ?? toastCopy.pdfDownloadFailedFallback,
        );
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
      const raw =
        error instanceof Error
          ? error.message
          : toastCopy.pdfDownloadFailedFallback;
      const description = `${raw.replace(/^WORKBOOK_RENDER_FAILED:\s*/i, "").trim()} ${toastCopy.pdfDownloadFailedHint}`;
      toast.error(toastCopy.actionFailedTitle, { description });
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size={size}
          variant={triggerVariant}
          disabled={pdfLoading}
          className={className}
        >
          {pdfLoading ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <Download aria-hidden="true" />
          )}
          {downloadLabel}
          <ChevronDown aria-hidden="true" className="size-3.5 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[13.5rem]">
        <DropdownMenuItem
          disabled={pdfLoading}
          onSelect={(event) => {
            event.preventDefault();
            void downloadPdf();
          }}
        >
          {pdfLoading ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <FileDown
              aria-hidden="true"
              className="size-4 text-muted-foreground"
            />
          )}
          <span className="flex min-w-0 flex-col gap-0.5">
            <span>{pdfLabel}</span>
            <span className="text-[11px] font-normal text-muted-foreground">
              Printable layout
            </span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={downloadHref}>
            <FileText
              aria-hidden="true"
              className="size-4 text-muted-foreground"
            />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span>{markdownLabel}</span>
              <span className="text-[11px] font-normal text-muted-foreground">
                Original source file
              </span>
            </span>
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
