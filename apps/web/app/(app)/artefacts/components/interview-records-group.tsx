import { NotebookPen } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

import { artefactsCopy } from "../../lib/copy";
import { moduleAccentStyle } from "../../lib/module-display";

type Props = {
  completedCount: number;
  recommendedCount: number;
  requirementMet: boolean;
  confirmed: boolean;
  /** Module 4 sequence index — accent colour only. */
  sequenceIndex: number;
  locked: boolean;
};

export function InterviewRecordsGroup({
  completedCount,
  recommendedCount,
  requirementMet,
  confirmed,
  sequenceIndex,
  locked,
}: Props) {
  const recordingComplete = confirmed || completedCount >= recommendedCount;

  const cta = locked
    ? null
    : recordingComplete
      ? artefactsCopy.readCta
      : completedCount > 0
        ? artefactsCopy.interviewRecordsContinueCta
        : artefactsCopy.interviewRecordsCta;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex items-start gap-4 border-b border-border bg-muted/30 px-5 py-4">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
          <NotebookPen className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-xl font-medium leading-snug tracking-[-0.01em] text-foreground">
            {artefactsCopy.interviewRecordsTitle}
          </h2>
          <p className="mt-1 text-[13px] leading-6 text-muted-foreground">
            {artefactsCopy.interviewRecordsSubtitle}
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {artefactsCopy.interviewRecordsProgress(
              completedCount,
              recommendedCount,
            )}
          </p>
          {recordingComplete ? (
            <p className="mt-1.5 text-[13px] leading-5 text-foreground">
              {confirmed
                ? "Evidence confirmed on Proof"
                : "Ready · Submit interviews, then confirm evidence on Proof"}
            </p>
          ) : requirementMet ? (
            <p className="mt-1.5 text-[13px] leading-5 text-foreground">
              Ready to submit interviews for review
            </p>
          ) : locked ? (
            <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">
              Opens after Module 3 is confirmed
            </p>
          ) : (
            <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">
              Complete all {recommendedCount} interviews, then submit them
            </p>
          )}
        </div>

        {cta ? (
          <Button
            asChild
            size="default"
            className="shrink-0 text-white hover:brightness-110"
            style={moduleAccentStyle(sequenceIndex)}
          >
            <Link href="/artefacts/interviews">{cta}</Link>
          </Button>
        ) : (
          <Button
            size="default"
            variant="outline"
            disabled
            className="shrink-0"
          >
            {artefactsCopy.lockedCta}
          </Button>
        )}
      </div>
    </section>
  );
}
