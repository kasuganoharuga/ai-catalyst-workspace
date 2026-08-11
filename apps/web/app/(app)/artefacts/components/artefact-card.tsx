import { Lock } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { ArtefactDownloadMenu } from "../../components/artefact-download-menu";
import { StatusBadge } from "../../components/status-badge";
import { artefactsCopy } from "../../lib/copy";
import { moduleAccentStyle } from "../../lib/module-display";
import type { ArtefactCardModel, ArtefactLinkOptions } from "../types";

function statusFor(row: ArtefactCardModel) {
  if (row.versionNumber !== null) {
    if (row.submissionStatus === "draft") {
      return {
        label: `Draft · v${row.versionNumber}`,
        tone: "outline" as const,
      };
    }
    return {
      label: `Saved · v${row.versionNumber}`,
      tone: "module" as const,
    };
  }
  if (row.websiteEvidence?.status === "confirmed") {
    return { label: "Confirmed", tone: "module" as const };
  }
  if (row.websiteEvidence?.status === "draft_preview") {
    return { label: "Draft preview", tone: "outline" as const };
  }
  return { label: "Not saved yet", tone: "muted" as const };
}

function detailFor(row: ArtefactCardModel): string {
  if (row.savedAt) {
    return `Saved at: ${formatDateTime(row.savedAt)}`;
  }
  if (row.websiteEvidence?.status === "confirmed") {
    return row.websiteEvidence.confirmedAt
      ? `Confirmed at: ${formatDateTime(row.websiteEvidence.confirmedAt)}`
      : "Confirmed on Proof";
  }
  if (row.websiteEvidence?.status === "draft_preview") {
    return "Preview on Proof · confirm to lock";
  }
  return row.isRequired
    ? "Required · waiting to be saved"
    : "Optional · not saved yet";
}

export function ArtefactDocumentRow({
  artefact,
  className,
  artefactsBasePath,
  showDownload = true,
}: {
  artefact: ArtefactCardModel;
  className?: string;
} & ArtefactLinkOptions) {
  const status = statusFor(artefact);
  const saved = artefact.versionNumber !== null;
  const websiteReadable = artefact.websiteEvidence != null;
  const artefactPath = `/artefacts/${encodeURIComponent(artefact.moduleKey)}/${encodeURIComponent(artefact.artifactKey)}`;
  const readHref = saved
    ? `${artefactsBasePath ?? ""}${artefactPath}`
    : `/modules/${encodeURIComponent(artefact.moduleKey)}`;
  const downloadHref = `${artefactPath}/download`;

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
          {detailFor(artefact)}
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
          {showDownload ? (
            <ArtefactDownloadMenu
              downloadHref={downloadHref}
              workbookAvailable={artefact.workbookAvailable}
              downloadLabel={artefactsCopy.downloadCta}
              pdfLabel={artefactsCopy.downloadWorkbookCta}
              markdownLabel={artefactsCopy.downloadSourceCta}
            />
          ) : null}
        </div>
      ) : websiteReadable ? (
        <div className="flex shrink-0 items-center">
          <Button
            asChild
            size="default"
            className="text-white hover:brightness-110"
            style={moduleAccentStyle(artefact.sequenceIndex)}
          >
            <Link href={readHref}>{artefactsCopy.readCta}</Link>
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
