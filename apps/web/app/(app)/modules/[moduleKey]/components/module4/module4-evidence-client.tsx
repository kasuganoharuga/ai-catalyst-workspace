"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import type {
  InterviewEvidenceStatus,
  InterviewProgress,
} from "@ai-catalyst/services/interview/types";

import { Button } from "@/components/ui/button";
import {
  confirmInterviewEvidenceAction,
  reopenInterviewEvidenceAction,
} from "@/lib/actions/interview-actions";
import { SHOW_CLAUDE_PROJECT } from "@/lib/feature-flags";
import { useSoftModuleRefresh } from "../../../../hooks/use-soft-module-refresh";
import { errorCopy, resolveModuleCopy, toastCopy } from "../../../../lib/copy";
import { moduleAccentStyle } from "../../../../lib/module-display";
import type { Module1RunProps } from "../../types";
import { OptionalClaudeProjectCard } from "../optional-claude-project-card";
import { Module1BriefStep } from "../module1/module1-brief-step";
import { Module1ConfirmStep } from "../module1/module1-confirm-step";
import { Module1WorkStep } from "../module1/module1-work-step";
import { DocumentPreview } from "../document-preview";
import { ModuleStepWizard } from "../shared/module-step-wizard";
import { StepHeading } from "../shared/step-heading";

const INTERVIEWS_HREF = "/artefacts/interviews";

type Props = Module1RunProps & {
  programRunId: string;
  progress: InterviewProgress;
  evidenceStatus: InterviewEvidenceStatus;
  /** Server-rendered Markdown — keeps react-markdown out of this client bundle. */
  previewDocument: ReactNode;
};

export function Module4EvidenceClient({
  programRunId,
  progress,
  evidenceStatus,
  previewDocument,
  ...runProps
}: Props) {
  const {
    moduleKey,
    moduleIndex,
    ventureId,
    claudeProjectId,
    connected,
    hasAttempt,
    awaitingConfirmation,
    isCompleted,
    needsRetry,
    preview,
  } = runProps;

  const router = useRouter();
  const copy = resolveModuleCopy(moduleKey);
  const [pending, startTransition] = useTransition();

  const confirmed = evidenceStatus === "confirmed";
  const submitted = evidenceStatus === "submitted";
  const canConfirm =
    submitted &&
    progress.requirementMet &&
    progress.draftCount === 0 &&
    !confirmed;
  const hasInterviews = progress.completedCount > 0;
  const workDone = awaitingConfirmation || isCompleted;
  const started =
    hasAttempt || awaitingConfirmation || isCompleted || confirmed;

  const steps = [
    { label: copy.stepBrief, done: started },
    { label: "Record & review evidence", done: confirmed },
    { label: copy.stepWork, done: workDone },
    { label: copy.stepConfirm, done: isCompleted },
  ];

  const firstIncomplete = steps.findIndex((step) => !step.done);
  const [activeStep, setActiveStep] = useState(
    firstIncomplete === -1 ? steps.length - 1 : firstIncomplete,
  );

  function run(
    action: () => Promise<{ ok: boolean; message?: string }>,
    successToast?: string,
  ) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(toastCopy.actionFailedTitle, {
          description: result.message ?? errorCopy.generic,
        });
        return;
      }
      if (successToast) {
        toast.success(successToast);
      }
      router.refresh();
    });
  }

  const shouldPoll =
    connected &&
    confirmed &&
    preview === null &&
    !awaitingConfirmation &&
    !isCompleted &&
    !needsRetry;

  useSoftModuleRefresh(shouldPoll);

  const accent = moduleAccentStyle(moduleIndex);

  const recordingComplete =
    confirmed || progress.completedCount >= progress.recommendedCount;

  const evidenceArtifact =
    runProps.artifacts.find(
      (artifact) => artifact.artifactKey === "interview_evidence",
    ) ?? null;
  const evidenceName = evidenceArtifact?.name ?? "Customer Interview Evidence";

  const interviewCountLabel = `${progress.completedCount} of ${progress.recommendedCount} interviews completed`;

  // Evidence gate: Next stays locked until Confirm evidence.
  const nextDisabled = activeStep === 1 && !confirmed;

  return (
    <div className="space-y-6">
      <ModuleStepWizard
        steps={steps}
        active={activeStep}
        onActiveChange={setActiveStep}
        accent={accent}
        nextDisabled={nextDisabled}
      >
        {activeStep === 0 ? <Module1BriefStep {...runProps} /> : null}

        {activeStep === 1 ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                {hasInterviews ? (
                  <StepHeading
                    title="Review your evidence"
                    body="Check the summary built from your completed interviews. Confirm evidence when it looks right — that locks Interview-Evidence.md for your AI assistant."
                  />
                ) : (
                  <StepHeading
                    title="Record your interviews"
                    body="Capture what you heard from real customers. Complete all five interviews and submit them, then return here to review and confirm evidence."
                  />
                )}
              </div>
              {recordingComplete ? (
                <Button
                  type="button"
                  size="default"
                  disabled
                  className="shrink-0"
                >
                  Recording complete
                </Button>
              ) : (
                <Button
                  asChild
                  size="default"
                  className="shrink-0 text-white hover:brightness-110"
                  style={accent}
                >
                  <Link href={INTERVIEWS_HREF}>
                    {hasInterviews ? "Continue recording" : "Record interviews"}
                  </Link>
                </Button>
              )}
            </div>

            <div className="mt-8 space-y-1 text-sm leading-6">
              <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {interviewCountLabel}
              </p>
              {canConfirm ? (
                <p className="font-medium text-foreground">
                  ✓ Interviews submitted — ready to confirm evidence
                </p>
              ) : null}
            </div>

            <div className="mt-6">
              {hasInterviews && previewDocument ? (
                <DocumentPreview
                  name={evidenceName}
                  meta={
                    confirmed
                      ? "Confirmed"
                      : submitted
                        ? "Submitted preview"
                        : "Draft preview"
                  }
                >
                  {previewDocument}
                </DocumentPreview>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border px-4 py-5">
                  <p className="text-sm font-semibold text-foreground">
                    Interview Evidence
                  </p>
                  <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                    Your evidence summary will appear here after you complete
                    your first interview.
                  </p>
                </div>
              )}
            </div>

            {!confirmed ? (
              <div className="mt-6">
                <Button
                  type="button"
                  size="lg"
                  disabled={pending || !canConfirm}
                  onClick={() =>
                    run(
                      async () => confirmInterviewEvidenceAction(programRunId),
                      toastCopy.evidenceConfirmed,
                    )
                  }
                  className="text-white hover:brightness-110"
                  style={accent}
                >
                  {pending ? "Confirming…" : "Confirm evidence"}
                </Button>
                {!canConfirm ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Complete all five interviews (no drafts left), use Submit
                    interviews on Customer interviews, then confirm here.
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Confirming locks Interview-Evidence.md for your AI assistant
                    attempt.
                  </p>
                )}
              </div>
            ) : !hasAttempt && !awaitingConfirmation && !isCompleted ? (
              <div className="mt-6">
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    run(
                      async () => reopenInterviewEvidenceAction(programRunId),
                      toastCopy.evidenceReopened,
                    )
                  }
                >
                  {pending ? "Reopening…" : "Reopen evidence"}
                </Button>
                <p className="mt-2 text-xs text-muted-foreground">
                  Returns interviews to draft so you can correct them. Once a
                  Module 4 assistant attempt has used this evidence, it stays
                  locked for that attempt.
                </p>
              </div>
            ) : null}
          </>
        ) : null}

        {activeStep === 2 ? (
          <Module1WorkStep
            {...runProps}
            accent={accent}
            lockAssistant={!confirmed}
            lockAssistantNote="Confirm your interview evidence before continuing with your AI assistant."
          />
        ) : null}

        {activeStep === 3 ? (
          <Module1ConfirmStep
            {...runProps}
            accent={accent}
            lockClaude={!confirmed}
          />
        ) : null}
      </ModuleStepWizard>

      {SHOW_CLAUDE_PROJECT && isCompleted && ventureId ? (
        <OptionalClaudeProjectCard
          ventureId={ventureId}
          initialProjectId={claudeProjectId}
        />
      ) : null}
    </div>
  );
}
