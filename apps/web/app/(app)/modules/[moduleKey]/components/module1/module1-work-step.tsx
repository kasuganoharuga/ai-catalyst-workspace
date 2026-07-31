"use client";

import { Check, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { cn } from "@/lib/utils";

import { ClaudeHandoff } from "../../../../components/claude-handoff";
import { claudeHandoffCopy, module1Copy } from "../../../../lib/copy";
import type { Module1RunProps, ModuleAccent } from "../../types";
import { CheckLine } from "../shared/check-line";
import { StepHeading } from "../shared/step-heading";
import { StrongAnswerCard } from "../strong-answer-card";

export function Module1WorkStep({
  connected,
  startPrompt,
  coreQuestions,
  decisionQuestions,
  artifactName,
  artifactVersion,
  awaitingConfirmation,
  isCompleted,
  preview,
  needsRetry,
  accent,
}: Module1RunProps & { accent: ModuleAccent }) {
  const isPreview = preview !== null;
  const answered = coreQuestions.filter(
    (q) => q.responseStatus !== null,
  ).length;
  const decisionAnswered = decisionQuestions.filter(
    (q) => q.responseStatus !== null,
  ).length;
  const documentSaved = artifactVersion !== null;
  const [questionsOpen, setQuestionsOpen] = useState(false);

  const previewBody =
    preview === "locked"
      ? module1Copy.workBodyLocked
      : module1Copy.workBodyNotStarted;
  const previewNote =
    preview === "locked"
      ? module1Copy.workLockedNote
      : module1Copy.workNotStartedNote;

  return (
    <>
      <StepHeading
        title={module1Copy.workTitle}
        body={isPreview ? previewBody : module1Copy.workBody}
      />

      <StrongAnswerCard />

      {/* Only when the module is live: in preview the heading above has
          already said why nothing here works yet. */}
      {!isPreview && !connected ? (
        <div className="mt-6 rounded-md border border-border bg-muted/40 px-4 py-3 text-sm leading-6 text-muted-foreground">
          {module1Copy.notConnected}{" "}
          <Link
            href="/connection"
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            {module1Copy.notConnectedLink}
          </Link>
          {module1Copy.notConnectedSuffix}
        </div>
      ) : null}

      <div className="mt-6">
        <ClaudeHandoff
          prompt={startPrompt}
          label={
            needsRetry ? claudeHandoffCopy.retryCta : claudeHandoffCopy.openCta
          }
          accent={accent}
          disabled={isPreview}
          disabledNote={previewNote}
        />
      </div>

      {/* Milestones from what Claude actually saved. The six questions sit
          as the first CheckLine — collapsed by default, expanded in place. */}
      <dl className="mt-8 text-sm">
        {coreQuestions.length > 0 ? (
          <div className="border-t border-border/70 py-3 first:border-t-0">
            <button
              type="button"
              onClick={() => setQuestionsOpen((open) => !open)}
              aria-expanded={questionsOpen}
              className="flex w-full items-start justify-between gap-4 text-left"
            >
              <span className="flex items-start gap-2.5">
                <span
                  className={cn(
                    "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                    answered === coreQuestions.length
                      ? "bg-primary"
                      : "border border-border",
                  )}
                >
                  {answered === coreQuestions.length ? (
                    <Check
                      aria-hidden="true"
                      className="h-2.5 w-2.5 text-primary-foreground"
                      strokeWidth={3}
                    />
                  ) : null}
                </span>
                <span className="text-foreground">
                  {module1Copy.questionsLabel}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-right text-xs leading-5 text-muted-foreground">
                <span className="font-mono tabular-nums">
                  {module1Copy.questionsCount(answered, coreQuestions.length)}
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={cn(
                    "h-3.5 w-3.5 transition-transform",
                    questionsOpen ? "rotate-180" : "rotate-0",
                  )}
                />
              </span>
            </button>

            {questionsOpen ? (
              <ol className="mt-3 space-y-2 pl-[1.625rem]">
                {coreQuestions.map((question) => {
                  const done = question.responseStatus !== null;
                  return (
                    <li key={question.questionKey} className="flex gap-3">
                      <span
                        className={cn(
                          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                          done ? "" : "border border-border",
                        )}
                        style={done ? accent : undefined}
                      >
                        {done ? (
                          <Check
                            aria-hidden="true"
                            className="h-2.5 w-2.5 text-white"
                            strokeWidth={3}
                          />
                        ) : null}
                      </span>
                      <span
                        className={cn(
                          "text-sm leading-6",
                          done ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {question.questionText}
                      </span>
                    </li>
                  );
                })}
              </ol>
            ) : null}
          </div>
        ) : null}

        <CheckLine
          ok={decisionAnswered > 0}
          label={module1Copy.progressDecision}
          detail={
            decisionAnswered > 0
              ? module1Copy.progressDecisionDone
              : module1Copy.progressDecisionPending
          }
        />
        <CheckLine
          ok={documentSaved}
          label={module1Copy.progressVerdict}
          detail={
            documentSaved
              ? `${artifactName ?? "Document"} · version ${artifactVersion}`
              : module1Copy.progressVerdictPending
          }
        />
        <CheckLine
          ok={awaitingConfirmation || isCompleted}
          label={module1Copy.progressChecks}
          detail={
            awaitingConfirmation || isCompleted
              ? module1Copy.progressChecksDone
              : module1Copy.progressChecksPending
          }
        />
      </dl>
    </>
  );
}
