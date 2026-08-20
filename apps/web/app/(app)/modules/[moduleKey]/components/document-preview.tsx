"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { ArtefactDownloadMenu } from "../../../components/artefact-download-menu";
import { module1Copy } from "../../../lib/copy";

// Tall enough to prove the document is real; short enough to keep Confirm reachable.
const COLLAPSED_MAX_PX = 420;

/**
 * Saved document on the confirm step — founders must see it before signing off.
 *
 * `children` is server-rendered Markdown so react-markdown stays out of the client bundle.
 */
export function DocumentPreview({
  name,
  meta,
  readHref = null,
  downloadHref = null,
  workbookAvailable = false,
  children,
}: {
  name: string;
  /** Version and save time, already formatted. */
  meta: string | null;
  /** Omit to hide "Open full page" (e.g. website-only evidence). */
  readHref?: string | null;
  /** Omit when no submission exists yet. */
  downloadHref?: string | null;
  /** Confirmed submission + renderer — PDF primary, Markdown secondary. */
  workbookAvailable?: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = bodyRef.current;
    if (!element) return;
    setOverflows(element.scrollHeight > COLLAPSED_MAX_PX + 24);
  }, [children]);

  const showFooter = overflows || Boolean(readHref);

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
        {downloadHref ? (
          <div className="flex shrink-0 items-center gap-2">
            <ArtefactDownloadMenu
              downloadHref={downloadHref}
              workbookAvailable={workbookAvailable}
              size="sm"
              downloadLabel={module1Copy.documentDownload}
              pdfLabel={module1Copy.documentDownloadWorkbook}
              markdownLabel={module1Copy.documentDownloadSource}
            />
          </div>
        ) : null}
      </div>

      <div className="relative">
        <div
          ref={bodyRef}
          style={expanded ? undefined : { maxHeight: `${COLLAPSED_MAX_PX}px` }}
          className={cn("overflow-hidden", expanded && "overflow-visible")}
        >
          {children}
        </div>
        {!expanded && overflows ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-card to-transparent"
          />
        ) : null}
      </div>

      {showFooter ? (
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
          {readHref ? (
            <Link
              href={readHref}
              className="text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              {module1Copy.documentOpenFull}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
