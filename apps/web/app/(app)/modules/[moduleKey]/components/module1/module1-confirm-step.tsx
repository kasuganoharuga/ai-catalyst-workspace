"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

import { StartModuleAttemptButton } from "../../../../components/start-module-attempt-button";
import {
  module1Copy,
  module1CompletedBody,
  module1CompletedTitle,
  module1ConfirmCta,
  type FounderDecision,
} from "../../../../lib/copy";
import { formatSavedAt } from "../../lib/format-saved-at";
import { useConfirmModuleCompletion } from "../../hooks/use-confirm-module-completion";
import type { Module1RunProps, ModuleAccent } from "../../types";
import { CheckLine } from "../shared/check-line";
import { StepHeading } from "../shared/step-heading";
import { DocumentPreview } from "../document-preview";

export function Module1ConfirmStep({
  moduleKey,
  programRunModuleId,
  artifactKey,
  artifactName,
  artifactVersion,
  artifactSavedAt,
  expectedArtifacts,
  decisionQuestions,
  needsRetry,
  awaitingConfirmation,
  isCompleted,
  preview,
  nextModuleTitle,
  documentPreview,
  accent,
}: Module1RunProps & { accent: ModuleAccent }) {
  const { isPending, handleConfirm } = useConfirmModuleCompletion({
    programRunModuleId,
    nextModuleTitle,
  });
  const isPreview = preview !== null;

  const documentSaved = artifactVersion !== null;
  const expected = expectedArtifacts[0] ?? null;
  const founderDecision =
    decisionQuestions.find((q) => q.questionKey === "founder_decision")
      ?.answerText ??
    decisionQuestions.find((q) => q.questionKey === "final_decision")
      ?.answerText ??
    null;
  const decisionLabel = founderDecision
    ? founderDecision.charAt(0).toUpperCase() + founderDecision.slice(1)
    : null;
  const showNoFileHeading = !isCompleted && !awaitingConfirmation;
  const canUseActions = !isPreview;

  const decision: FounderDecision =
    founderDecision === "kill" || founderDecision === "pivot"
      ? founderDecision
      : "proceed";
  const completedTitle = module1CompletedTitle(decision);
  const completedBody = module1CompletedBody(decision, nextModuleTitle);
  const confirmCta = module1ConfirmCta(decision);

  return (
    <>
      {showNoFileHeading ? (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="font-serif text-xl font-medium tracking-[-0.01em] text-foreground">
              {module1Copy.confirmNoFileTitle}
            </h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {preview === "locked"
                ? module1Copy.confirmNoFileLocked
                : preview === "not-started"
                  ? module1Copy.confirmNoFileNotStarted
                  : module1Copy.confirmNoFileBody}
            </p>
          </div>
          {canUseActions && needsRetry && programRunModuleId ? (
            <StartModuleAttemptButton
              programRunModuleId={programRunModuleId}
              size="default"
              className="shrink-0 text-white hover:brightness-110"
              style={accent}
            />
          ) : null}
        </div>
      ) : (
        <StepHeading
          title={isCompleted ? completedTitle : module1Copy.confirmTitle}
          body={isCompleted ? completedBody : module1Copy.confirmBody}
        />
      )}

      {/* Saved: show the document. Not saved: show what it will contain. */}
      {documentSaved && artifactKey && documentPreview ? (
        <div className="mt-6 space-y-4">
          <DocumentPreview
            name={artifactName ?? expected?.name ?? "Verdict"}
            meta={
              artifactVersion !== null
                ? module1Copy.documentMeta(
                    artifactVersion,
                    artifactSavedAt ? formatSavedAt(artifactSavedAt) : null,
                  )
                : null
            }
            readHref={`/artefacts/${encodeURIComponent(moduleKey)}/${encodeURIComponent(artifactKey)}`}
            downloadHref={`/artefacts/${encodeURIComponent(moduleKey)}/${encodeURIComponent(artifactKey)}/download`}
          >
            {documentPreview}
          </DocumentPreview>

          {decisionLabel ? (
            <dl className="overflow-hidden rounded-lg border border-border px-4 py-2 text-sm">
              <CheckLine
                ok
                label={module1Copy.documentDecisionLabel}
                detail={decisionLabel}
              />
            </dl>
          ) : null}
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-border">
          <div className="border-b border-border bg-muted/40 px-4 py-2.5">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {module1Copy.documentHeading}
            </p>
          </div>
          <dl className="px-4 py-2 text-sm">
            <CheckLine
              ok={false}
              label={artifactName ?? expected?.name ?? "Verdict"}
              detail={module1Copy.documentNotSaved}
            />
          </dl>
          {expected && expected.outline.length > 0 ? (
            <div className="border-t border-border px-4 py-4">
              <p className="text-xs font-medium text-muted-foreground">
                {module1Copy.documentCovers}
              </p>
              <ul className="mt-2 space-y-1">
                {expected.outline.map((section) => (
                  <li
                    key={section.heading}
                    className="text-xs leading-5 text-muted-foreground"
                  >
                    {section.heading}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}

      {isCompleted ? (
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {founderDecision === "kill" ? (
            <>
              {/* "Venture" is the database's word, not the founder's. */}
              <Button asChild size="lg" className="text-white" style={accent}>
                <Link href="/workspace">{module1Copy.backToIdeas}</Link>
              </Button>
              {nextModuleTitle ? (
                <Button asChild size="lg" variant="outline">
                  <Link href="/modules">Continue anyway</Link>
                </Button>
              ) : null}
            </>
          ) : founderDecision === "pivot" ? (
            <>
              <Button asChild size="lg" className="text-white" style={accent}>
                <Link href="/modules">
                  {nextModuleTitle
                    ? `Continue to ${nextModuleTitle}`
                    : "See your modules"}
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href={`/modules/module-01-pressure-test`}>
                  Redo Module 1
                </Link>
              </Button>
            </>
          ) : (
            <Button asChild size="lg" className="text-white" style={accent}>
              <Link href="/modules">
                {nextModuleTitle
                  ? `Continue to ${nextModuleTitle}`
                  : "See your modules"}
              </Link>
            </Button>
          )}
        </div>
      ) : canUseActions && awaitingConfirmation ? (
        <div className="mt-6">
          <Button
            type="button"
            size="lg"
            onClick={handleConfirm}
            disabled={isPending || !programRunModuleId}
            className="text-white hover:brightness-110"
            style={accent}
          >
            {isPending ? "Confirming…" : confirmCta}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            {module1Copy.reviseHint}
          </p>
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">
          {isPreview
            ? module1Copy.confirmUnavailable
            : module1Copy.confirmFinishFirst}
        </p>
      )}
    </>
  );
}
