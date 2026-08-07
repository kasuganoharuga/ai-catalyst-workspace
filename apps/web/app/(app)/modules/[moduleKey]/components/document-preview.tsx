"use client";

import { ChevronDown, Download } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { module1Copy } from "../../../lib/copy";

// Tall enough to show a verdict's opening section and prove the document is
// real, short enough that the Confirm button stays reachable without a long
// scroll. Anything past this is one click away.
const COLLAPSED_MAX_PX = 420;

/**
 * The saved document itself, on the page that asks the founder to sign it
 * off.
 *
 * Confirming used to be a decision made against a filename and a version
 * number: the step said "read it over, then confirm" while showing neither
 * the document nor a way to read it without leaving. Anyone in a hurry
 * confirmed a document they had not seen, which is the one thing this step
 * exists to prevent.
 *
 * `children` is the Markdown already rendered upstream on the server, so
 * react-markdown never reaches the client bundle for this page.
 */
export function DocumentPreview({
  name,
  meta,
  readHref,
  downloadHref,
  workbookAvailable = false,
  children,
}: {
  name: string;
  /** Version and save time, already formatted. */
  meta: string | null;
  readHref: string;
  downloadHref: string;
  /** A confirmed submission exists and a renderer is configured — shows the fillable PDF as the primary download, Markdown as secondary. */
  workbookAvailable?: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  // Only worth a toggle if there is something hidden. Measured rather than
  // guessed from content length: a short verdict with a table is taller
  // than a long one without.
  const [overflows, setOverflows] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = bodyRef.current;
    if (!element) return;
    setOverflows(element.scrollHeight > COLLAPSED_MAX_PX + 24);
  }, [children]);

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {name}
          </p>
          {meta ? (
            <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
              {meta}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {workbookAvailable ? (
            <>
              <Button asChild variant="outline" size="sm">
                <a href={`${downloadHref}?format=workbook`}>
                  <Download aria-hidden="true" />
                  {module1Copy.documentDownloadWorkbook}
                </a>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <a href={downloadHref}>{module1Copy.documentDownloadSource}</a>
              </Button>
            </>
          ) : (
            <Button asChild variant="outline" size="sm">
              <a href={downloadHref}>
                <Download aria-hidden="true" />
                {module1Copy.documentDownload}
              </a>
            </Button>
          )}
        </div>
      </div>

      <div className="relative">
        <div
          ref={bodyRef}
          style={expanded ? undefined : { maxHeight: `${COLLAPSED_MAX_PX}px` }}
          className={cn("overflow-hidden", expanded && "overflow-visible")}
        >
          {children}
        </div>
        {/* Fades the cut edge so it reads as "more below" rather than as a
            document that stops mid-sentence. */}
        {!expanded && overflows ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-card to-transparent"
          />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
        {overflows ? (
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            aria-expanded={expanded}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline-offset-2 hover:underline"
          >
            {expanded
              ? module1Copy.documentCollapse
              : module1Copy.documentExpand}
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                expanded ? "rotate-180" : "rotate-0",
              )}
            />
          </button>
        ) : (
          <span />
        )}
        <Link
          href={readHref}
          className="text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {module1Copy.documentOpenFull}
        </Link>
      </div>
    </div>
  );
}
