import { Download } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
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
  versionNumber: number | null;
  submissionStatus: string | null;
  /** Last write time for "Saved …"; null when nothing is stored yet. */
  savedAt: string | null;
};

export type ArtefactModuleGroupModel = {
  moduleKey: string;
  moduleTitle: string;
  moduleSubtitle: string | null;
  sequenceIndex: number;
  artefacts: ArtefactCardModel[];
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

/** One document row inside a module group. */
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
            <Link href={readHref}>Read document</Link>
          </Button>
          <Button asChild size="default" variant="outline">
            <a href={downloadHref}>
              <Download aria-hidden="true" />
              Download
            </a>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
