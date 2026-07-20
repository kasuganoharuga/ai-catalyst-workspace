"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { StatusBadge } from "../../components/status-badge";
import { moduleAccentStyle } from "../../lib/module-display";

export type ArtefactCardModel = {
  moduleKey: string;
  moduleTitle: string;
  moduleSubtitle: string | null;
  sequenceIndex: number;
  artifactKey: string;
  name: string;
  requiredFilename: string | null;
  isRequired: boolean;
  outlineHeadings: string[];
  versionNumber: number | null;
  submissionStatus: string | null;
  submittedAt: string | null;
};

function statusFor(row: ArtefactCardModel) {
  if (row.versionNumber === null) {
    return { label: "Not saved yet", tone: "muted" as const };
  }
  if (row.submissionStatus === "draft") {
    return { label: `Draft · v${row.versionNumber}`, tone: "outline" as const };
  }
  return {
    label: `Saved · v${row.versionNumber}`,
    tone: "module" as const,
  };
}

export function ArtefactCard({ artefact }: { artefact: ArtefactCardModel }) {
  const [open, setOpen] = useState(false);
  const status = statusFor(artefact);
  const saved = artefact.versionNumber !== null;

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-start gap-4 p-5 text-left transition hover:bg-muted/30"
      >
        <span
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold tabular-nums text-white"
          style={moduleAccentStyle(artefact.sequenceIndex)}
        >
          {String(artefact.sequenceIndex).padStart(2, "0")}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <h2 className="font-serif text-lg font-medium leading-snug tracking-[-0.01em] text-foreground">
              {artefact.name}
            </h2>
            <div className="flex items-center gap-2">
              <StatusBadge
                status={status}
                moduleIndex={artefact.sequenceIndex}
              />
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                  open ? "rotate-180" : "rotate-0",
                )}
              />
            </div>
          </div>
          <p className="mt-1.5 text-[13px] leading-6 text-muted-foreground">
            From {artefact.moduleTitle}
            {artefact.moduleSubtitle ? (
              <span className="text-muted-foreground/80">
                {" "}
                · {artefact.moduleSubtitle}
              </span>
            ) : null}
          </p>
        </div>
      </button>

      {open ? (
        <div className="border-t border-border px-5 pb-5 pt-4">
          <dl className="grid gap-2 text-xs sm:pl-12">
            {artefact.requiredFilename ? (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 text-muted-foreground">Filename</dt>
                <dd className="min-w-0 truncate font-mono text-foreground">
                  {artefact.requiredFilename}
                </dd>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between gap-3">
              <dt className="shrink-0 text-muted-foreground">Required</dt>
              <dd className="text-foreground">
                {artefact.isRequired ? "Yes" : "Optional"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="shrink-0 text-muted-foreground">Last saved</dt>
              <dd className="text-foreground">
                {artefact.submittedAt
                  ? formatDateTime(artefact.submittedAt)
                  : "—"}
              </dd>
            </div>
          </dl>

          {artefact.outlineHeadings.length > 0 ? (
            <div className="mt-4 sm:pl-12">
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Covers
              </p>
              <ul className="mt-2 space-y-1">
                {artefact.outlineHeadings.map((heading) => (
                  <li
                    key={heading}
                    className="text-[13px] leading-5 text-muted-foreground"
                  >
                    {heading}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-4 border-t border-border/70 pt-3 sm:pl-12">
            <Link
              href={`/modules/${artefact.moduleKey}`}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground underline-offset-2 hover:underline"
            >
              {saved ? "Open the module" : "Start saving it in the module"}
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
