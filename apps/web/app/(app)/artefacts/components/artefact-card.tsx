import { Download, Lock } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { StatusBadge } from "../../components/status-badge";
import { artefactsCopy } from "../../lib/copy";
import { moduleAccentStyle } from "../../lib/module-display";
import type { ArtefactCardModel } from "../types";

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

export function ArtefactDocumentRow({
  artefact,
  className,
}: {
  artefact: ArtefactCardModel;
  className?: string;
}) {
  const status = statusFor(artefact);
  const saved = artefact.versionNumber !== null;
  const readHref = `/artefacts/${artefact.moduleKey}/${artefact.artifactKey}`;
  const downloadHref = `${readHref}/download`;

  return (
    <div
      className={cn(
        "flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h3 className="font-serif text-lg font-medium leading-snug tracking-[-0.01em] text-foreground">
            {artefact.name}
          </h3>
          <StatusBadge status={status} moduleIndex={artefact.sequenceIndex} />
        </div>
        <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">
          {artefact.savedAt
            ? `Saved at: ${formatDateTime(artefact.savedAt)}`
            : artefact.isRequired
              ? "Required · waiting to be saved"
              : "Optional · not saved yet"}
        </p>
      </div>

      {saved ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            asChild
            size="default"
            className="text-white hover:brightness-110"
            style={moduleAccentStyle(artefact.sequenceIndex)}
          >
            <Link href={readHref}>{artefactsCopy.readCta}</Link>
          </Button>
          <Button asChild size="default" variant="outline">
            <a href={downloadHref}>
              <Download aria-hidden="true" />
              {artefactsCopy.downloadCta}
            </a>
          </Button>
        </div>
      ) : artefact.startAction ? (
        <div className="flex shrink-0 items-center">
          {artefact.startAction.kind === "start" ? (
            <Button
              asChild
              size="default"
              className="text-white hover:brightness-110"
              style={moduleAccentStyle(artefact.sequenceIndex)}
            >
              <Link href={artefact.startAction.href}>
                {artefactsCopy.startCta}
              </Link>
            </Button>
          ) : (
            <Button size="default" variant="outline" disabled>
              <Lock aria-hidden="true" />
              {artefactsCopy.lockedCta}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
