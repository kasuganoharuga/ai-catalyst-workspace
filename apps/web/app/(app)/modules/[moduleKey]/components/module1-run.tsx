"use client";

import { Check, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import type { ModuleContextQuestion } from "@ai-catalyst/shared";

import { Button } from "@/components/ui/button";
import { confirmModuleCompletionAction } from "@/lib/actions/founder-actions";
import { cn } from "@/lib/utils";

import { SHOW_CLAUDE_PROJECT } from "@/lib/feature-flags";

import { ClaudeHandoff } from "../../../components/claude-handoff";
import { StartModuleAttemptButton } from "../../../components/start-module-attempt-button";
import { DocumentPreview } from "./document-preview";
import { useSoftModuleRefresh } from "../../../hooks/use-soft-module-refresh";
import {
  claudeHandoffCopy,
  errorCopy,
  toastCopy,
  module1Copy,
  module1CompletedBody,
  module1CompletedTitle,
  module1ConfirmCta,
  type FounderDecision,
} from "../../../lib/copy";
import { moduleAccentStyle } from "../../../lib/module-display";
import { OptionalClaudeProjectCard } from "./optional-claude-project-card";
import { StrongAnswerCard } from "./strong-answer-card";

/**
 * Why this module is being shown read-only.
 *
 * "locked" — an earlier module has to be finished first.
 * "not-started" — no Run exists yet, usually because Claude isn't
 *   connected. The founder can read everything; nothing can be saved.
 */
export type ModulePreviewReason = "locked" | "not-started" | null;

type ExpectedArtifact = {
  artifactKey: string;
  name: string;
  requiredFilename: string | null;
  outline: { heading: string; items: string[] }[];
};

type Module1RunProps = {
  moduleKey: string;
  moduleIndex: number;
  programRunModuleId: string | null;
  ventureId: string | null;
  claudeProjectId: string | null;
  connected: boolean;
  coreQuestions: ModuleContextQuestion[];
  decisionQuestions: ModuleContextQuestion[];
  artifactKey: string | null;
  artifactName: string | null;
  artifactVersion: number | null;
  artifactSavedAt: string | null;
  expectedArtifacts: ExpectedArtifact[];
  hasAttempt: boolean;
  needsRetry: boolean;
  awaitingConfirmation: boolean;
  isCompleted: boolean;
  /**
   * Preview-only when set: the module's content stays fully visible and
   * every action is withheld. The reason picks the wording — "finish the
   * previous module" and "connect Claude" are different problems, and
   * naming the wrong one sends a founder to fix something that isn't
   * broken.
   *
   * `null` means the module is live and workable.
   */
  preview: ModulePreviewReason;
  /**
   * The saved document, already rendered on the server. Null until Claude
   * has saved something — passed in rather than fetched here so this stays
   * a client component without pulling react-markdown into its bundle.
   */
  documentPreview: ReactNode;
  startPrompt: string;
  nextModuleTitle: string | null;
};

/**
 * Module 1 in the same three-card shape as Module 0's setup.
 *
 * The work itself happens in Claude, so this page's job is narrow: say
 * what the module is for and what it will cost you before you start, hand
 * over the prompt, then show honest progress and take the sign-off. One
 * card at a time keeps "what do I do now" unambiguous — the same reason
 * setup is built this way.
 */
export function Module1Run(props: Module1RunProps) {
  const {
    moduleIndex,
    coreQuestions,
    hasAttempt,
    awaitingConfirmation,
    isCompleted,
    preview,
    connected,
    needsRetry,
    ventureId,
    claudeProjectId,
  } = props;
  const isPreview = preview !== null;

  const answered = coreQuestions.filter(
    (q) => q.responseStatus !== null,
  ).length;
  const started =
    hasAttempt || answered > 0 || awaitingConfirmation || isCompleted;

  const shouldPoll =
    connected &&
    !isPreview &&
    !awaitingConfirmation &&
    !isCompleted &&
    !needsRetry;

  useSoftModuleRefresh(shouldPoll);

  const steps = [
    { label: module1Copy.stepBrief, done: started },
    {
      label: module1Copy.stepWork,
      done: awaitingConfirmation || isCompleted,
    },
    { label: module1Copy.stepConfirm, done: isCompleted },
  ];

  const firstIncomplete = steps.findIndex((step) => !step.done);
  const [active, setActive] = useState(
    firstIncomplete === -1 ? steps.length - 1 : firstIncomplete,
  );

  const accent = moduleAccentStyle(moduleIndex);

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <ol className="flex divide-x divide-border border-b border-border">
          {steps.map((step, index) => (
            <li key={step.label} className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setActive(index)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-3 text-left transition sm:px-4",
                  index === active ? "bg-muted/60" : "hover:bg-muted/30",
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-semibold tabular-nums",
                    step.done
                      ? "text-white"
                      : index === active
                        ? "border border-foreground text-foreground"
                        : "border border-border text-muted-foreground",
                  )}
                  style={step.done ? accent : undefined}
                >
                  {step.done ? (
                    <Check
                      aria-hidden="true"
                      className="h-3 w-3"
                      strokeWidth={3}
                    />
                  ) : (
                    index + 1
                  )}
                </span>
                <span
                  className={cn(
                    "hidden truncate text-[13px] sm:block",
                    index === active
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {step.label}
                </span>
              </button>
            </li>
          ))}
        </ol>

        <div className="p-6 lg:p-8">
          {active === 0 ? <BriefStep {...props} /> : null}
          {active === 1 ? <WorkStep {...props} accent={accent} /> : null}
          {active === 2 ? <ConfirmStep {...props} accent={accent} /> : null}

          <div className="mt-8 flex items-center justify-between gap-4 border-t border-border pt-5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setActive((n) => Math.max(0, n - 1))}
              disabled={active === 0}
            >
              Back
            </Button>
            <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {active + 1} / {steps.length}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setActive((n) => Math.min(steps.length - 1, n + 1))
              }
              disabled={active === steps.length - 1}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
      {SHOW_CLAUDE_PROJECT && isCompleted && ventureId ? (
        <OptionalClaudeProjectCard
          ventureId={ventureId}
          initialProjectId={claudeProjectId}
        />
      ) : null}
    </div>
  );
}

function StepHeading({
  title,
  body,
}: {
  title: string;
  body: React.ReactNode;
}) {
  return (
    <>
      <h3 className="font-serif text-xl font-medium tracking-[-0.01em] text-foreground">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
    </>
  );
}

/**
 * The brief deliberately does not list the questions. Reading six hard
 * questions cold invites pre-drafted answers, which is exactly what makes
 * the exercise worthless — Claude asks them one at a time for a reason.
 * What a Founder needs here is why the next 40 minutes are worth spending.
 */
function BriefStep({ moduleIndex }: Module1RunProps) {
  return (
    <>
      <StepHeading
        title={module1Copy.briefTitle}
        body={module1Copy.briefBody}
      />

      <div className="mt-8">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {module1Copy.whyHeading}
        </p>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {module1Copy.whyBody}
        </p>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {module1Copy.whyBuildsOn(String(moduleIndex))}
        </p>
      </div>

      {/* The honest warning, before they start rather than after. */}
      <div className="mt-8 rounded-md border border-border bg-muted/40 p-5">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {module1Copy.beforeHeading}
        </p>
        <ul className="mt-3 space-y-2.5 text-sm leading-6 text-muted-foreground">
          {module1Copy.before.map((item) => (
            <li key={item.lead} className="flex gap-2.5">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
              <span>
                <span className="font-medium text-foreground">{item.lead}</span>{" "}
                {item.body}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function WorkStep({
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
}: Module1RunProps & { accent: { backgroundColor: string } }) {
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
          already said why nothing here works yet, and repeating it turns
          one explanation into two. */}
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

function formatSavedAt(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ConfirmStep({
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
}: Module1RunProps & { accent: { backgroundColor: string } }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
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

  function handleConfirm() {
    if (!programRunModuleId) return;
    startTransition(async () => {
      const result = await confirmModuleCompletionAction(programRunModuleId);
      if (!result.ok) {
        toast.error(toastCopy.actionFailedTitle, {
          description: result.message ?? errorCopy.generic,
        });
        return;
      }
      // Confirming is the one irreversible thing on this page, and the
      // page it refreshes into looks much like the one before it. Say what
      // the click actually achieved.
      toast.success(toastCopy.moduleConfirmed, {
        description: nextModuleTitle
          ? toastCopy.moduleConfirmedNext(nextModuleTitle)
          : undefined,
      });
      router.refresh();
    });
  }

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
              label="Start another pass"
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

      {/* Saved: show the document. Not saved: show what it will contain.
          The outline is guidance for a document that doesn't exist yet —
          once it does, the real headings say the same thing better. */}
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
            readHref={`/artefacts/${moduleKey}/${artifactKey}`}
            downloadHref={`/artefacts/${moduleKey}/${artifactKey}/download`}
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

function CheckLine({
  ok,
  label,
  detail,
}: {
  ok: boolean;
  label: string;
  detail: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-border/70 py-3 first:border-t-0">
      <dt className="flex items-start gap-2.5">
        <span
          className={cn(
            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
            ok ? "bg-primary" : "border border-border",
          )}
        >
          {ok ? (
            <Check
              aria-hidden="true"
              className="h-2.5 w-2.5 text-primary-foreground"
              strokeWidth={3}
            />
          ) : null}
        </span>
        <span className="text-foreground">{label}</span>
      </dt>
      <dd className="max-w-[16rem] text-right text-xs leading-5 text-muted-foreground">
        {detail}
      </dd>
    </div>
  );
}
