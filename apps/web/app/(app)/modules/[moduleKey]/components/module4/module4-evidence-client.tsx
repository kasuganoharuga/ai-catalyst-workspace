"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import type {
  InterviewEvidenceStatus,
  InterviewProgress,
} from "@ai-catalyst/services/interview";

import { Button } from "@/components/ui/button";
import { confirmInterviewEvidenceAction } from "@/lib/actions/interview-actions";
import { SHOW_CLAUDE_PROJECT } from "@/lib/feature-flags";
import { useSoftModuleRefresh } from "../../../../hooks/use-soft-module-refresh";
import { resolveModuleCopy } from "../../../../lib/copy";
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
  const [error, setError] = useState<string | null>(null);

  const confirmed = evidenceStatus === "confirmed";
  const canConfirm = progress.requirementMet;
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

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.message ?? "Something went wrong.");
        return;
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
      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

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
                    body="Complete and lock at least five customer interviews, then return here to review and confirm the evidence."
                  />
                ) : (
                  <StepHeading
                    title="Record your interviews"
                    body="Capture what you heard from real customers before analysing the evidence. You must complete at least five interviews before evidence can be submitted."
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
                  ✓ Five interviews completed — ready to confirm
                </p>
              ) : null}
            </div>

            <div className="mt-6">
              {hasInterviews && previewDocument ? (
                <DocumentPreview
                  name={evidenceName}
                  meta={confirmed ? "Confirmed" : "Draft preview"}
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
                    run(async () =>
                      confirmInterviewEvidenceAction(programRunId),
                    )
                  }
                  className="text-white hover:brightness-110"
                  style={accent}
                >
                  {pending ? "Confirming…" : "Confirm evidence"}
                </Button>
                {!canConfirm ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Complete at least five interviews before confirming. You can
                    also submit from Customer interviews.
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Confirming locks this evidence for your AI assistant
                    attempt.
                  </p>
                )}
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
