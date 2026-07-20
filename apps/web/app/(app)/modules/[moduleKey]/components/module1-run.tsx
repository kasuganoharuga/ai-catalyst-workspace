"use client";

import { Check, ChevronDown, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { ModuleContextQuestion } from "@ai-catalyst/shared";

import { Button } from "@/components/ui/button";
import { confirmModuleCompletionAction } from "@/lib/actions/founder-actions";
import { cn } from "@/lib/utils";

import { CopyButton } from "../../../components/copy-button";
import {
  claudeChatProjectUrl,
  claudeChatProjectWebUrl,
  claudeChatUrl,
  claudeDesktopChatUrl,
  moduleAccentStyle,
} from "../../../lib/module-display";
import { StrongAnswerCard } from "./strong-answer-card";

type ExpectedArtifact = {
  artifactKey: string;
  name: string;
  requiredFilename: string | null;
  outline: { heading: string; items: string[] }[];
};

type Module1RunProps = {
  moduleIndex: number;
  programRunModuleId: string | null;
  claudeProjectId: string | null;
  connected: boolean;
  coreQuestions: ModuleContextQuestion[];
  decisionQuestions: ModuleContextQuestion[];
  artifactName: string | null;
  artifactVersion: number | null;
  artifactSavedAt: string | null;
  expectedArtifacts: ExpectedArtifact[];
  hasAttempt: boolean;
  awaitingConfirmation: boolean;
  isCompleted: boolean;
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
  } = props;

  const answered = coreQuestions.filter(
    (q) => q.responseStatus !== null,
  ).length;
  const started =
    hasAttempt || answered > 0 || awaitingConfirmation || isCompleted;

  const steps = [
    { label: "What this is", done: started },
    { label: "Work through it", done: awaitingConfirmation || isCompleted },
    { label: "Confirm and unlock", done: isCompleted },
  ];

  const firstIncomplete = steps.findIndex((step) => !step.done);
  const [active, setActive] = useState(
    firstIncomplete === -1 ? steps.length - 1 : firstIncomplete,
  );

  const accent = moduleAccentStyle(moduleIndex);

  return (
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
            onClick={() => setActive((n) => Math.min(steps.length - 1, n + 1))}
            disabled={active === steps.length - 1}
          >
            Next
          </Button>
        </div>
      </div>
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
        title="What this module is for"
        body="Claude takes the part of a veteran investor and puts your idea under real pressure — where it breaks, who you're actually competing with, and what would have to be true for it to work. You leave with a call you can defend: proceed, pivot, or kill."
      />

      <div className="mt-8">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Why it matters
        </p>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Most ideas don&apos;t die because the founder couldn&apos;t build
          them. They die because nobody asked the uncomfortable questions early
          enough — and by the time the market answered them, a year and a lot of
          money were gone. This is the cheapest version of that conversation:
          one sitting, on paper, before you&apos;ve committed anything real.
        </p>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Everything after Module {moduleIndex} builds on the verdict you write
          here. A vague answer now quietly costs you in every module that
          follows.
        </p>
      </div>

      {/* The honest warning, before they start rather than after. */}
      <div className="mt-8 rounded-md border border-border bg-muted/40 p-5">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Before you start
        </p>
        <ul className="mt-3 space-y-2.5 text-sm leading-6 text-muted-foreground">
          <li className="flex gap-2.5">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
            <span>
              <span className="font-medium text-foreground">
                Set aside 30–45 uninterrupted minutes.
              </span>{" "}
              Half-answers produce a verdict that isn&apos;t worth having.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
            <span>
              <span className="font-medium text-foreground">
                Be specific, not polished.
              </span>{" "}
              &ldquo;Founders who&apos;ve cold-emailed 50 investors and
              stalled&rdquo; beats &ldquo;early-stage startups&rdquo;. Rough
              wording is fine.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
            <span>
              <span className="font-medium text-foreground">
                Expect to be argued with.
              </span>{" "}
              Claude plays a veteran investor here. It will name the strongest
              case against your idea and push back on vague answers — that is
              the point, not a malfunction.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
            <span>
              <span className="font-medium text-foreground">
                It can&apos;t replace talking to real customers.
              </span>{" "}
              Anything you assert without a real conversation behind it gets
              recorded as an assumption, not evidence.
            </span>
          </li>
        </ul>
      </div>
    </>
  );
}

function WorkStep({
  claudeProjectId,
  connected,
  startPrompt,
  coreQuestions,
  decisionQuestions,
  artifactName,
  artifactVersion,
  awaitingConfirmation,
  isCompleted,
  accent,
}: Module1RunProps & { accent: { backgroundColor: string } }) {
  const projectId = claudeProjectId?.trim() || null;
  const desktopUrl = projectId
    ? claudeChatProjectUrl(projectId)
    : claudeDesktopChatUrl(startPrompt);
  const webUrl = projectId
    ? claudeChatProjectWebUrl(projectId)
    : claudeChatUrl(startPrompt);
  const openLabel = projectId ? "Open your project" : "Open Claude";

  const answered = coreQuestions.filter(
    (q) => q.responseStatus !== null,
  ).length;
  const decisionAnswered = decisionQuestions.filter(
    (q) => q.responseStatus !== null,
  ).length;
  const documentSaved = artifactVersion !== null;
  const [questionsOpen, setQuestionsOpen] = useState(false);

  return (
    <>
      <StepHeading
        title="Work through it in Claude"
        body="Send the line below in your project. Claude asks the questions one at a time — this page tracks what it has saved as you go, so you can leave and come back."
      />

      <StrongAnswerCard />

      {!connected ? (
        <div className="mt-6 rounded-md border border-border bg-muted/40 px-4 py-3 text-sm leading-6 text-muted-foreground">
          Claude still needs a one-time connector to this workspace before it
          can save anything.{" "}
          <Link
            href="/connection"
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            Set up the connection
          </Link>
          , then come back here.
        </div>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-lg border border-border">
        <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-2.5">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Send this
          </p>
          <CopyButton value={startPrompt} label="Copy" />
        </div>
        <p className="px-4 py-4 font-mono text-sm leading-6 text-foreground">
          {startPrompt}
        </p>
        <div className="border-t border-border px-4 py-4">
          <Button
            asChild
            size="lg"
            className="w-full text-white hover:brightness-110"
            style={accent}
          >
            <a href={desktopUrl}>
              {openLabel}
              <ExternalLink aria-hidden="true" />
            </a>
          </Button>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {projectId
              ? "Opens your project in the Claude desktop app when installed. Paste the line above into a new chat there. "
              : "Opens Claude Desktop with this message ready to send. "}
            <a
              href={webUrl}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              Open in browser instead
            </a>
          </p>
        </div>
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
                  Six pressure-test questions
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-right text-xs leading-5 text-muted-foreground">
                <span className="font-mono tabular-nums">
                  {answered} / {coreQuestions.length} answered
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
          label="Proceed, pivot or kill recorded"
          detail={
            decisionAnswered > 0
              ? "Your decision is saved."
              : "Comes after the verdict."
          }
        />
        <CheckLine
          ok={documentSaved}
          label="Verdict saved to your workspace"
          detail={
            documentSaved
              ? `${artifactName ?? "Document"} · version ${artifactVersion}`
              : "Nothing saved yet."
          }
        />
        <CheckLine
          ok={awaitingConfirmation || isCompleted}
          label="Passed its checks"
          detail={
            awaitingConfirmation || isCompleted
              ? "Ready for you to look over."
              : "Runs automatically once the verdict is saved."
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
  programRunModuleId,
  artifactName,
  artifactVersion,
  artifactSavedAt,
  expectedArtifacts,
  decisionQuestions,
  awaitingConfirmation,
  isCompleted,
  nextModuleTitle,
  accent,
}: Module1RunProps & { accent: { backgroundColor: string } }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const documentSaved = artifactVersion !== null;
  const expected = expectedArtifacts[0] ?? null;
  const finalDecision =
    decisionQuestions.find((q) => q.questionKey === "final_decision")
      ?.answerText ?? null;

  function handleConfirm() {
    if (!programRunModuleId) return;
    setError(null);
    startTransition(async () => {
      const result = await confirmModuleCompletionAction(programRunModuleId);
      if (!result.ok) {
        setError(
          result.message ??
            "That didn't work — give it another try in a moment.",
        );
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <StepHeading
        title={
          isCompleted
            ? "Signed off — and the next module is open"
            : awaitingConfirmation
              ? "Read it over, then sign it off"
              : "No file detected yet"
        }
        body={
          isCompleted
            ? nextModuleTitle
              ? `You confirmed this, which opened ${nextModuleTitle}. Your verdict stays in your workspace.`
              : "You confirmed this. Your verdict stays in your workspace."
            : awaitingConfirmation
              ? "Your verdict is saved and has passed its checks. Confirming marks this module done — until you do, nothing moves."
              : "We haven't found a verdict in your workspace yet. Once Claude saves it and it passes its checks, this is where you sign it off."
        }
      />

      <div className="mt-6 overflow-hidden rounded-lg border border-border">
        <div className="border-b border-border bg-muted/40 px-4 py-2.5">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            The document
          </p>
        </div>
        <dl className="px-4 py-2 text-sm">
          <CheckLine
            ok={documentSaved}
            label={artifactName ?? expected?.name ?? "Verdict"}
            detail={
              documentSaved
                ? `Version ${artifactVersion}${
                    artifactSavedAt
                      ? ` · ${formatSavedAt(artifactSavedAt)}`
                      : ""
                  }`
                : "Not saved yet."
            }
          />
          {finalDecision ? (
            <CheckLine
              ok
              label="Your decision"
              detail={
                finalDecision.charAt(0).toUpperCase() + finalDecision.slice(1)
              }
            />
          ) : null}
        </dl>
        {expected && expected.outline.length > 0 ? (
          <div className="border-t border-border px-4 py-4">
            <p className="text-xs font-medium text-muted-foreground">
              It should cover
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

      {isCompleted ? (
        <div className="mt-6">
          <Button asChild size="lg" className="text-white" style={accent}>
            <Link href="/modules">See your modules</Link>
          </Button>
        </div>
      ) : awaitingConfirmation ? (
        <div className="mt-6">
          <Button
            type="button"
            size="lg"
            onClick={handleConfirm}
            disabled={isPending || !programRunModuleId}
            className="text-white hover:brightness-110"
            style={accent}
          >
            {isPending ? "Confirming…" : "Confirm and unlock the next module"}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Not happy with it? Ask Claude to revise it — nothing is locked in
            until you confirm.
          </p>
          {error ? (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">
          Finish the conversation in the previous step first.
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
