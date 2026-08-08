import Link from "next/link";

import {
  getInterviewActivityForProgramRun,
  getInterviewProgress,
  listInterviewRecords,
} from "@ai-catalyst/services/interview";

import { Button } from "@/components/ui/button";
import { getCurrentFounderActor } from "@/lib/current-founder-actor";
import { appPageTitle } from "@/lib/page-metadata";
import { listModuleContextsForActiveRun } from "@/lib/run-modules";

import { PageShell } from "../../components/page-shell";
import { artefactsCopy } from "../../lib/copy";
import { MODULE_4_KEY } from "../../lib/module-display";
import { InterviewRecordsClient } from "./interview-records-client";

export const metadata = appPageTitle("Customer interviews");

export default async function InterviewRecordsPage() {
  const actor = await getCurrentFounderActor();
  const contexts = await listModuleContextsForActiveRun(actor);
  const module4 = contexts.find(
    (context) => context.runModule.moduleKey === MODULE_4_KEY,
  );
  const programRunId = module4?.runModule.programRunId ?? null;
  const hasAttempt = Boolean(module4?.activeAttempt);

  const activity = programRunId
    ? await getInterviewActivityForProgramRun(actor, programRunId)
    : null;

  const [records, progress] =
    activity && programRunId
      ? await Promise.all([
          listInterviewRecords(actor, activity.id),
          getInterviewProgress(actor, programRunId),
        ])
      : [null, null];

  return (
    <PageShell>
      <div className="mx-auto max-w-3xl">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          <Link
            href="/artefacts"
            className="underline-offset-2 hover:underline"
          >
            Artefacts
          </Link>
          <span aria-hidden="true"> / </span>
          Customer interviews
        </p>
        <h1 className="mt-4 font-serif text-[2.25rem] font-medium leading-tight tracking-[-0.02em]">
          {artefactsCopy.interviewRecordsTitle}
        </h1>
        <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
          {artefactsCopy.interviewRecordsSubtitle}
        </p>
      </div>

      <div className="mt-10">
        {!activity || !records ? (
          <div className="mx-auto max-w-3xl rounded-xl border border-border bg-card p-6 text-sm leading-6 text-muted-foreground">
            <p>
              Interview recording opens after you confirm Module 3 on the
              website, so your interview questions can be snapshotted.
            </p>
            <Button asChild variant="outline" className="mt-4">
              <Link href="/modules">Back to modules</Link>
            </Button>
          </div>
        ) : (
          <InterviewRecordsClient
            activityId={activity.id}
            questions={activity.questions}
            records={records}
            progress={
              progress ?? {
                completedCount: 0,
                recommendedCount: 5,
                requirementMet: false,
                evidenceStatus: activity.evidenceStatus,
                draftCount: 0,
                totalCount: 0,
              }
            }
            evidenceStatus={activity.evidenceStatus}
            hasAttempt={hasAttempt}
          />
        )}
      </div>
    </PageShell>
  );
}
