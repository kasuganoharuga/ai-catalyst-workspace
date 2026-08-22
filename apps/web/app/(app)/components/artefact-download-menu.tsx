"use client";

import {
  ChevronDown,
  Download,
  FileDown,
  FileSpreadsheet,
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

type FetchedFormat = "workbook" | "docx" | "xlsx";

const FALLBACK_FILENAME: Record<FetchedFormat, string> = {
  workbook: "document.pdf",
  docx: "document.docx",
  xlsx: "document.xlsx",
};

// Strips the ServiceErrorCode prefix a route may put at the front of its
// message (WORKBOOK_RENDER_FAILED, ARTIFACT_HAS_NO_TABLES, …) so the toast
// reads as a sentence, not a log line.
const ERROR_CODE_PREFIX_PATTERN = /^[A-Z][A-Z0-9_]*:\s*/;

/**
 * Artefact download. Shows a dropdown whenever more than the plain
 * Markdown source is offered — Word (always, once any confirmed submission
 * exists), PDF (workbookAvailable), Excel (tablesAvailable) — and falls
 * back to a single Markdown link only when none of those apply. Every
 * non-Markdown format goes through fetch so a render failure surfaces as a
 * toast instead of raw JSON in the browser.
 */
export function ArtefactDownloadMenu({
  downloadHref,
  workbookAvailable,
  tablesAvailable = false,
  size = "default",
  triggerVariant = "outline",
  singleVariant = "outline",
  downloadLabel = "Download",
  pdfLabel = "Download PDF",
  docxLabel = "Download Word",
  xlsxLabel = "Download Excel",
  markdownLabel = "Download Markdown",
  className,
}: {
  downloadHref: string;
  workbookAvailable: boolean;
  /** Excel export — only offer this where content has already been read (the detail page), never on a list row (would mean a content read per row). Defaults to false. */
  tablesAvailable?: boolean;
  size?: "default" | "sm" | "lg";
  /** Variant of the single trigger button shown when only Markdown is offered. */
  triggerVariant?: "default" | "outline" | "ghost";
  /** Variant of the lone Download link shown when only Markdown is offered. */
  singleVariant?: "default" | "outline" | "ghost";
  downloadLabel?: string;
  pdfLabel?: string;
  docxLabel?: string;
  xlsxLabel?: string;
  markdownLabel?: string;
  className?: string;
}) {
  const [loadingFormat, setLoadingFormat] = useState<FetchedFormat | null>(
    null,
  );

  async function downloadFormat(format: FetchedFormat) {
    setLoadingFormat(format);
    try {
      const response = await fetch(`${downloadHref}?format=${format}`);
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
        /filename="([^"]+)"/.exec(disposition)?.[1] ??
        FALLBACK_FILENAME[format];
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
      const description = `${raw.replace(ERROR_CODE_PREFIX_PATTERN, "").trim()} ${toastCopy.pdfDownloadFailedHint}`;
      toast.error(toastCopy.actionFailedTitle, { description });
    } finally {
      setLoadingFormat(null);
    }
  }

  // Word export is unconditional (any confirmed Markdown submission can
  // become a .docx), so this component always has more than one download
  // option and the single-link fallback path is unreachable today — kept
  // as an explicit guard rather than deleted, since PDF/Excel availability
  // is already conditional and a future format could be too.
  const hasDropdownOptions = true;
  if (!hasDropdownOptions) {
    return (
      <Button asChild size={size} variant={singleVariant} className={className}>
        <a href={downloadHref}>
          <Download aria-hidden="true" />
          {downloadLabel}
        </a>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size={size}
          variant={triggerVariant}
          disabled={loadingFormat !== null}
          className={className}
        >
          {loadingFormat !== null ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <Download aria-hidden="true" />
          )}
          {downloadLabel}
          <ChevronDown aria-hidden="true" className="size-3.5 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[13.5rem]">
        {workbookAvailable && (
          <DropdownMenuItem
            disabled={loadingFormat !== null}
            onSelect={(event) => {
              event.preventDefault();
              void downloadFormat("workbook");
            }}
          >
            {loadingFormat === "workbook" ? (
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
        )}
        <DropdownMenuItem
          disabled={loadingFormat !== null}
          onSelect={(event) => {
            event.preventDefault();
            void downloadFormat("docx");
          }}
        >
          {loadingFormat === "docx" ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <FileText
              aria-hidden="true"
              className="size-4 text-muted-foreground"
            />
          )}
          <span className="flex min-w-0 flex-col gap-0.5">
            <span>{docxLabel}</span>
            <span className="text-[11px] font-normal text-muted-foreground">
              Editable document
            </span>
          </span>
        </DropdownMenuItem>
        {tablesAvailable && (
          <DropdownMenuItem
            disabled={loadingFormat !== null}
            onSelect={(event) => {
              event.preventDefault();
              void downloadFormat("xlsx");
            }}
          >
            {loadingFormat === "xlsx" ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <FileSpreadsheet
                aria-hidden="true"
                className="size-4 text-muted-foreground"
              />
            )}
            <span className="flex min-w-0 flex-col gap-0.5">
              <span>{xlsxLabel}</span>
              <span className="text-[11px] font-normal text-muted-foreground">
                Tables from this document
              </span>
            </span>
          </DropdownMenuItem>
        )}
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
