"use client";

import { Check, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { cn } from "@/lib/utils";

import { AssistantHandoff } from "../../../../components/assistant-handoff";
import { resolveModuleCopy } from "../../../../lib/copy";
import {
  buildQuestionDisplayGroups,
  isWorkPrerequisiteMet,
  prerequisiteArtifactKey,
  requiredOutputArtifactsSaved,
} from "../../../../lib/module-display";
import type { Module1RunProps, ModuleAccent } from "../../types";
import { CheckLine } from "../shared/check-line";
import { StepHeading } from "../shared/step-heading";
import { StrongAnswerCard } from "../strong-answer-card";

export function Module1WorkStep({
  moduleKey,
  connected,
  provider,
  startPrompt,
  coreQuestions,
  decisionQuestions,
  artifacts,
  awaitingConfirmation,
  isCompleted,
  preview,
  needsRetry,
  accent,
  lockAssistant = false,
  lockAssistantNote,
}: Module1RunProps & {
  accent: ModuleAccent;
  /** Soft-lock the Claude handoff while earlier website work is unfinished. */
  lockAssistant?: boolean;
  lockAssistantNote?: string;
}) {
  const copy = resolveModuleCopy(moduleKey);
  const isPreview = preview !== null;
  // Simplified, block-level rows — never the full question text; see
  // buildQuestionDisplayGroups for why Module 2 collapses to eight blocks
  // while every other Module gets one short-labelled row per Question.
  const displayGroups = buildQuestionDisplayGroups(moduleKey, coreQuestions);
  const answered = displayGroups.filter((group) => group.done).length;
  const decisionAnswered = decisionQuestions.filter(
    (q) => q.responseStatus !== null,
  ).length;
  const prerequisiteMet = isWorkPrerequisiteMet(moduleKey, artifacts);
  // The prerequisite Artifact already has its own row above these — it is
  // what the founder brings in, not what the Module produces, and listing
  // it twice would read as two separate documents.
  const prerequisiteKey = prerequisiteArtifactKey(moduleKey);
  const outputArtifacts = artifacts.filter(
    (artifact) => artifact.artifactKey !== prerequisiteKey,
  );
  // One source of truth for the green "everything required" check: the
  // conversational blocks must still read complete, and the required
  // Claude outputs must be saved. READY FOR REVIEW alone is not enough —
  // an empty Retry that only re-saved Artifacts must not look finished
  // while the checklist still shows 0 / N.
  const questionsComplete =
    displayGroups.length === 0 || answered === displayGroups.length;
  const checksReady =
    (awaitingConfirmation || isCompleted) &&
    requiredOutputArtifactsSaved(moduleKey, artifacts) &&
    questionsComplete;
  const [questionsOpen, setQuestionsOpen] = useState(false);

  const previewBody =
    preview === "locked" ? copy.workBodyLocked : copy.workBodyNotStarted;
  const previewNote =
    preview === "locked" ? copy.workLockedNote : copy.workNotStartedNote;

  return (
    <>
      <StepHeading
        title={copy.workTitle}
        body={isPreview ? previewBody : copy.workBody}
      />

      <StrongAnswerCard card={copy.coachingCard} />

      {/* Only when the module is live: in preview the heading above has
          already said why nothing here works yet. */}
      {!isPreview && !connected ? (
        <div className="mt-6 rounded-md border border-border bg-muted/40 px-4 py-3 text-sm leading-6 text-muted-foreground">
          {copy.notConnected}{" "}
          <Link
            href="/connection"
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            {copy.notConnectedLink}
          </Link>
          {copy.notConnectedSuffix}
        </div>
      ) : null}

      <div className="mt-6">
        <AssistantHandoff
          provider={provider}
          prompt={startPrompt}
          retry={needsRetry}
          accent={accent}
          disabled={isPreview || lockAssistant}
          disabledNote={
            lockAssistant
              ? (lockAssistantNote ??
                "Confirm your interview evidence first, then continue in Claude.")
              : previewNote
          }
        />
      </div>

      {/* Milestones from what the assistant actually saved. The questions
          sit as the first CheckLine — collapsed by default, expanded in
          place as short block labels, never the full question text (the
          assistant asks those one at a time; reading them cold here would
          invite pre-drafted answers). */}
      <dl className="mt-8 text-sm">
        {/* First, because it gates every row under it: the assistant will not
            open the questions until this has arrived. */}
        {copy.workPrerequisite ? (
          <CheckLine
            ok={prerequisiteMet}
            label={copy.workPrerequisite.label}
            detail={
              prerequisiteMet
                ? copy.workPrerequisite.done
                : copy.workPrerequisite.pending
            }
          />
        ) : null}
        {displayGroups.length > 0 ? (
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
                    answered === displayGroups.length
                      ? "bg-primary"
                      : "border border-border",
                  )}
                >
                  {answered === displayGroups.length ? (
                    <Check
                      aria-hidden="true"
                      className="h-2.5 w-2.5 text-primary-foreground"
                      strokeWidth={3}
                    />
                  ) : null}
                </span>
                <span className="text-foreground">{copy.questionsLabel}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-right text-xs leading-5 text-muted-foreground">
                <span className="font-mono tabular-nums">
                  {copy.questionsCount(answered, displayGroups.length)}
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
                {displayGroups.map((group) => (
                  <li key={group.key} className="flex gap-3">
                    <span
                      className={cn(
                        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                        group.done ? "" : "border border-border",
                      )}
                      style={group.done ? accent : undefined}
                    >
                      {group.done ? (
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
                        group.done
                          ? "text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {group.label}
                    </span>
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
        ) : null}

        {/* Only Module 1 has a Founder decision to record — a Module with
            no decisionQuestions at all (2-4 today) never shows this row,
            rather than announcing "Comes after the verdict." forever. */}
        {decisionQuestions.length > 0 ? (
          <CheckLine
            ok={decisionAnswered > 0}
            label={copy.progressDecision}
            detail={
              decisionAnswered > 0
                ? copy.progressDecisionDone
                : copy.progressDecisionPending
            }
          />
        ) : null}
        {/* One CheckLine per Artifact this Module produces. A Module with
            exactly one (Module 0 and 1 today) keeps the original
            single-document copy; a Module with more than one (Modules 3 and
            4) names each document by itself — Phase 2 gives every Module its
            own progress-row copy, this is the structural loop that lets it. */}
        {outputArtifacts.length === 1 ? (
          <CheckLine
            ok={outputArtifacts[0].versionNumber !== null}
            label={copy.progressVerdict}
            detail={
              outputArtifacts[0].versionNumber !== null
                ? `${outputArtifacts[0].name} · version ${outputArtifacts[0].versionNumber}`
                : copy.progressVerdictPending
            }
          />
        ) : (
          outputArtifacts.map((artifact) => (
            <CheckLine
              key={artifact.artifactKey}
              ok={artifact.versionNumber !== null}
              label={artifact.name}
              detail={
                artifact.versionNumber !== null
                  ? `Saved · version ${artifact.versionNumber}`
                  : copy.progressVerdictPending
              }
            />
          ))
        )}
        <CheckLine
          ok={checksReady}
          label={copy.progressChecks}
          detail={
            checksReady ? copy.progressChecksDone : copy.progressChecksPending
          }
        />
      </dl>
    </>
  );
}
