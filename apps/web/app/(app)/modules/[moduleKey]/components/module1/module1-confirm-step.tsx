"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

import { StartModuleAttemptButton } from "../../../../components/start-module-attempt-button";
import {
  resolveModuleCopy,
  module1CompletedBody,
  module1CompletedTitle,
  module1ConfirmCta,
  moduleCompletedBody,
  moduleCompletedTitle,
  moduleConfirmCta,
  type FounderDecision,
} from "../../../../lib/copy";
import { formatSavedAt } from "../../lib/format-saved-at";
import { useConfirmModuleCompletion } from "../../hooks/use-confirm-module-completion";
import type {
  Module1RunProps,
  ModuleAccent,
  ModuleArtifactView,
} from "../../types";
import { CheckLine } from "../shared/check-line";
import { StepHeading } from "../shared/step-heading";
import { DocumentPreview } from "../document-preview";

/**
 * One Artifact's confirm-step card: the saved document if there is one,
 * otherwise what it will contain once saved (its outline). Used both for
 * the single-Artifact case (Modules 0 and 1) and looped for Modules with
 * more than one (3 and 4).
 */
function ArtifactStatusBlock({
  moduleKey,
  artifact,
}: {
  moduleKey: string;
  artifact: ModuleArtifactView;
}) {
  const copy = resolveModuleCopy(moduleKey);
  if (artifact.versionNumber !== null && artifact.documentPreview) {
    return (
      <DocumentPreview
        name={artifact.name}
        meta={copy.documentMeta(
          artifact.versionNumber,
          artifact.savedAt ? formatSavedAt(artifact.savedAt) : null,
        )}
        readHref={`/artefacts/${encodeURIComponent(moduleKey)}/${encodeURIComponent(artifact.artifactKey)}`}
        downloadHref={`/artefacts/${encodeURIComponent(moduleKey)}/${encodeURIComponent(artifact.artifactKey)}/download`}
      >
        {artifact.documentPreview}
      </DocumentPreview>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="border-b border-border bg-muted/40 px-4 py-2.5">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {copy.documentHeading}
        </p>
      </div>
      <dl className="px-4 py-2 text-sm">
        <CheckLine
          ok={false}
          label={artifact.name}
          detail={copy.documentNotSaved}
        />
      </dl>
      {/* One wrapped line, not a column of headings — this is a hint about a
          document that doesn't exist yet, so it should cost a line or two,
          not half the card. */}
      {artifact.outline.length > 0 ? (
        <div className="border-t border-border px-4 py-3">
          <p className="text-xs leading-5 text-muted-foreground">
            <span className="font-medium">{copy.documentCovers}:</span>{" "}
            {artifact.outline.map((section) => section.heading).join(" · ")}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function Module1ConfirmStep({
  moduleKey,
  programRunModuleId,
  artifacts,
  decisionQuestions,
  needsRetry,
  awaitingConfirmation,
  isCompleted,
  preview,
  nextModuleTitle,
  accent,
}: Module1RunProps & { accent: ModuleAccent }) {
  const { isPending, handleConfirm } = useConfirmModuleCompletion({
    programRunModuleId,
    nextModuleTitle,
  });
  const copy = resolveModuleCopy(moduleKey);
  const isPreview = preview !== null;

  const anySaved = artifacts.some(
    (artifact) => artifact.versionNumber !== null,
  );
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

  // Only Module 1 has a Founder decision (decisionQuestions is empty for
  // every other standard Module) — everything else reads off whether a
  // next Module actually exists, so Module 4 (the last one currently open)
  // never claims one does.
  const hasDecision = decisionQuestions.length > 0;
  const decision: FounderDecision =
    founderDecision === "kill" || founderDecision === "pivot"
      ? founderDecision
      : "proceed";
  const completedTitle = hasDecision
    ? module1CompletedTitle(decision)
    : moduleCompletedTitle(nextModuleTitle);
  const completedBody = hasDecision
    ? module1CompletedBody(decision, nextModuleTitle)
    : moduleCompletedBody(nextModuleTitle);
  const confirmCta = hasDecision
    ? module1ConfirmCta(decision)
    : moduleConfirmCta(nextModuleTitle);

  return (
    <>
      {showNoFileHeading ? (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="font-serif text-xl font-medium tracking-[-0.01em] text-foreground">
              {copy.confirmNoFileTitle}
            </h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {preview === "locked"
                ? copy.confirmNoFileLocked
                : preview === "not-started"
                  ? copy.confirmNoFileNotStarted
                  : copy.confirmNoFileBody}
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
          title={isCompleted ? completedTitle : copy.confirmTitle}
          body={isCompleted ? completedBody : copy.confirmBody}
        />
      )}

      {/* One card per Artifact: saved shows the document, unsaved shows what
          it will contain. A single Artifact (Modules 0 and 1) keeps its
          card and the decision line in one bordered group exactly as
          before; more than one (Modules 3 and 4) stacks each Artifact's own
          card in sequence order, with the decision line (if any) once at
          the end. */}
      {artifacts.length === 1 ? (
        <div className="mt-6 space-y-4">
          <ArtifactStatusBlock moduleKey={moduleKey} artifact={artifacts[0]} />
          {decisionLabel && anySaved ? (
            <dl className="overflow-hidden rounded-lg border border-border px-4 py-2 text-sm">
              <CheckLine
                ok
                label={copy.documentDecisionLabel}
                detail={decisionLabel}
              />
            </dl>
          ) : null}
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {artifacts.map((artifact) => (
            <ArtifactStatusBlock
              key={artifact.artifactKey}
              moduleKey={moduleKey}
              artifact={artifact}
            />
          ))}
          {decisionLabel && anySaved ? (
            <dl className="overflow-hidden rounded-lg border border-border px-4 py-2 text-sm">
              <CheckLine
                ok
                label={copy.documentDecisionLabel}
                detail={decisionLabel}
              />
            </dl>
          ) : null}
        </div>
      )}

      {isCompleted ? (
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {founderDecision === "kill" ? (
            <>
              {/* "Venture" is the database's word, not the founder's. */}
              <Button asChild size="lg" className="text-white" style={accent}>
                <Link href="/workspace">{copy.backToIdeas}</Link>
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
            {copy.reviseHint}
          </p>
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">
          {isPreview ? copy.confirmUnavailable : copy.confirmFinishFirst}
        </p>
      )}
    </>
  );
}
