import Link from "next/link";
import { notFound } from "next/navigation";

import { ServiceError } from "@ai-catalyst/services/errors";
import { getLatestValidation } from "@ai-catalyst/services/artifact";
import type { ArtifactValidation, RunModuleSummary } from "@ai-catalyst/shared";

import { Button } from "@/components/ui/button";
import { getActiveContext } from "@/lib/active-context";
import { getCurrentFounderActor } from "@/lib/current-founder-actor";
import { getMcpConnectionStatus } from "@/lib/mcp-connection";
import { getModuleCatalogEntry } from "@/lib/module-catalog";
import { getModuleContextByKey, listRunModules } from "@/lib/run-modules";
import { getVenture } from "@/lib/ventures";

import { RecheckButton } from "../../components/recheck-button";
import { StartRunButton } from "../../components/start-run-button";
import { StatusBadge } from "../../components/status-badge";
import {
  DECISION_QUESTION_KEYS,
  claudeChatUrl,
  deriveModuleDisplayStatus,
  moduleAccentStyle,
  startModulePrompt,
} from "../../lib/module-display";
import { StatusPill } from "../components/status-pill";
import { ExpectedOutputCard } from "./components/expected-output-card";
import { ConfirmCompletionCard } from "./components/confirm-completion-card";
import { DecisionCard } from "./components/decision-card";
import { Module0Guide } from "./components/module0-guide";
import { ModuleRunPanel } from "./components/module-run-panel";
import { QuestionChecklist } from "./components/question-checklist";
import { StrongAnswerCard } from "./components/strong-answer-card";
import { ValidationIssuesCard } from "./components/validation-issues-card";

type ModuleDetailPageProps = {
  params: Promise<{ moduleKey: string }>;
};

export default async function ModuleDetailPage({
  params,
}: ModuleDetailPageProps) {
  const { moduleKey } = await params;
  const actor = await getCurrentFounderActor();

  let entry;
  try {
    entry = await getModuleCatalogEntry(actor, moduleKey);
  } catch (error) {
    if (error instanceof ServiceError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  const isLive = entry.catalogStatus === "live";
  const [context, connection, runResult] = isLive
    ? await Promise.all([
        getModuleContextByKey(actor, moduleKey),
        getMcpConnectionStatus(actor),
        listRunModules(actor),
      ])
    : [null, null, { modules: [] as RunModuleSummary[] }];

  const runModule = context?.runModule ?? null;
  const activeAttempt = context?.activeAttempt ?? null;
  const isSetupModule = entry.moduleType === "setup";
  const isLocked = runModule?.status === "locked";
  const isCompleted = runModule?.status === "completed";
  const verdictReady = activeAttempt?.status === "ready_for_review";
  // Passed validation and waiting on the Founder's own sign-off, which is
  // what completes the module and opens the next one.
  const awaitingConfirmation =
    verdictReady && runModule !== null && context !== null;

  // What confirming will open, so the card can name it rather than saying
  // "the next module".
  const nextModuleTitle = runModule
    ? (runResult.modules.find((m) => m.sequenceIndex > runModule.sequenceIndex)
        ?.title ?? null)
    : null;

  // The real failure reasons, only when the last pass didn't stick —
  // fetched here (not in the run panel) so the page decides when the
  // H5b/H6e-style panel appears.
  let failedValidation: ArtifactValidation | null = null;
  const primaryArtifactKey = context?.artifacts[0]?.artifactKey ?? null;
  if (
    activeAttempt?.status === "validation_failed" &&
    primaryArtifactKey !== null
  ) {
    const validation = await getLatestValidation(actor, {
      attemptId: activeAttempt.id,
      artifactKey: primaryArtifactKey,
    });
    if (validation && validation.status === "failed") {
      failedValidation = validation;
    }
  }

  const coreQuestions =
    context?.questions.filter(
      (q) => !DECISION_QUESTION_KEYS.has(q.questionKey),
    ) ?? [];
  const decisionQuestions =
    context?.questions.filter((q) =>
      DECISION_QUESTION_KEYS.has(q.questionKey),
    ) ?? [];

  const startPrompt = startModulePrompt(
    `Module ${entry.sequenceIndex} · ${entry.title}`,
  );
  const claudeActionLabel = (() => {
    if (!activeAttempt) return "Start in Claude";
    if (activeAttempt.status === "validation_failed")
      return "Fix it up in Claude";
    if (verdictReady || isCompleted) return "Open Claude";
    return "Continue in Claude";
  })();
  const showClaudeAction =
    Boolean(connection?.authorised) && runModule !== null && !isLocked;

  // Needed only when there's no Run to attach state to yet.
  const activeContext =
    isLive && !runModule ? await getActiveContext(actor) : null;
  const venture = activeContext?.ventureId
    ? await getVenture(actor, activeContext.ventureId)
    : null;

  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <p className="text-sm font-semibold text-muted-foreground">
        <Link href="/modules" className="hover:underline">
          Modules
        </Link>{" "}
        <span className="text-border">/</span> Module {entry.sequenceIndex}
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span
            className="flex h-11 w-11 items-center justify-center rounded-full font-mono text-sm font-semibold tabular-nums text-white"
            style={moduleAccentStyle(entry.sequenceIndex)}
          >
            {isCompleted ? "✓" : String(entry.sequenceIndex).padStart(2, "0")}
          </span>
          <h1 className="text-4xl font-semibold tracking-tight">
            {entry.title}
          </h1>
        </div>
        {runModule ? (
          <StatusBadge
            status={deriveModuleDisplayStatus(
              runModule.status,
              activeAttempt?.status ?? null,
            )}
            moduleIndex={entry.sequenceIndex}
          />
        ) : (
          <StatusPill status={entry.catalogStatus} />
        )}
      </div>

      {entry.subtitle ? (
        <p className="mt-4 max-w-3xl text-lg leading-8 text-muted-foreground">
          {entry.subtitle}
        </p>
      ) : null}

      {/* Coming-soon module: nothing to do yet. */}
      {!isLive ? (
        <div className="mt-10 max-w-3xl rounded-[2rem] border border-border bg-muted/40 p-8">
          <p className="text-base leading-7 text-muted-foreground">
            This module is still being crafted. It&apos;ll open up as you
            progress through the program — nothing for you to do right now.
          </p>
          <Button asChild variant="outline" size="lg" className="mt-6">
            <Link href="/modules">Back to modules</Link>
          </Button>
        </div>
      ) : null}

      {/* Live module, but the Founder's Run doesn't exist yet. */}
      {isLive && !runModule ? (
        <div className="mt-10 max-w-3xl rounded-[2rem] border border-border bg-card p-8 shadow-sm">
          <h2 className="text-xl font-semibold tracking-tight">
            One quick step before this module can track your progress
          </h2>
          <p className="mt-3 text-base leading-7 text-muted-foreground">
            Set up your module plan — it creates your personal run of the
            toolkit with Module 0 ready to go. One click, once ever.
          </p>
          {venture ? (
            <StartRunButton ventureId={venture.id} className="mt-6" />
          ) : (
            <p className="mt-6 text-sm text-muted-foreground">
              You need an active Venture first —{" "}
              <Link href="/workspace" className="underline">
                create one here
              </Link>
              .
            </p>
          )}
        </div>
      ) : null}

      {/* Locked module. */}
      {isLocked ? (
        <div className="mt-10 flex max-w-3xl flex-wrap items-center justify-between gap-4 rounded-[2rem] border border-border bg-muted/40 p-6">
          <p className="text-sm leading-6 text-muted-foreground">
            <span className="font-semibold text-foreground">
              Locked for now.
            </span>{" "}
            Each module builds on the one before it — finish the previous module
            and this one opens automatically.
          </p>
          <Button asChild variant="outline" className="shrink-0">
            <Link href="/modules">Back to modules</Link>
          </Button>
        </div>
      ) : null}

      {/* Module 1 context strip: inherited context from Module 0. */}
      {isLive && runModule && !isSetupModule && !isLocked ? (
        <div className="mt-8 flex items-start gap-3 rounded-2xl border border-border bg-muted/40 px-5 py-4">
          <span className="mt-0.5 text-sm">✓</span>
          <p className="text-sm leading-6 text-muted-foreground">
            Your setup from Module 0 carries over — Claude already knows your
            workspace and your venture. No re-explaining, just continue the
            conversation.
          </p>
        </div>
      ) : null}

      {/* Main content grid for a live module with a Run. */}
      {runModule && context ? (
        <section className="mt-8 grid gap-8 lg:grid-cols-[1fr_22rem]">
          <div className="space-y-6">
            {failedValidation ? (
              <ValidationIssuesCard validation={failedValidation} />
            ) : null}

            {isSetupModule ? (
              <Module0Guide
                connected={Boolean(connection?.authorised)}
                startPrompt={startPrompt}
              />
            ) : (
              <>
                <div className="rounded-[2rem] border border-border bg-card p-6 shadow-sm lg:p-8">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    What this module does
                  </h2>
                  <p className="mt-4 text-base leading-7 text-muted-foreground">
                    {entry.description ??
                      "A guided working session you run in Claude."}
                  </p>
                  <p className="mt-4 text-base leading-7 text-muted-foreground">
                    You&apos;ll answer the questions below one at a time, in
                    conversation. Then the evaluator turns honest: a four-part
                    verdict, the strongest case against your idea, and a
                    decision only you can make — proceed, pivot, or kill.
                  </p>
                </div>
                {coreQuestions.length > 0 ? (
                  <QuestionChecklist questions={coreQuestions} />
                ) : null}
                {!isCompleted && !verdictReady ? <StrongAnswerCard /> : null}
                <DecisionCard questions={decisionQuestions} />
              </>
            )}

            {/* Passed its checks but not yet signed off — the one thing
                only the Founder can do, and the gate the next module
                sits behind. */}
            {awaitingConfirmation ? (
              <ConfirmCompletionCard
                programRunModuleId={runModule.id}
                artifactName={
                  context.artifacts[0]?.name ??
                  entry.expectedArtifacts[0]?.name ??
                  null
                }
                nextModuleTitle={nextModuleTitle}
              />
            ) : null}

            {isCompleted ? (
              <div className="rounded-xl border border-primary/40 bg-accent p-6">
                <p className="text-base font-semibold text-accent-foreground">
                  {nextModuleTitle
                    ? `Confirmed — ${nextModuleTitle} is open`
                    : "Confirmed and done"}
                </p>
                <p className="mt-1 text-sm leading-6 text-accent-foreground/80">
                  Everything this module produced is saved in your workspace and
                  stays there.
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              {showClaudeAction ? (
                <Button asChild size="lg">
                  <a
                    href={claudeChatUrl(startPrompt)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {claudeActionLabel}
                  </a>
                </Button>
              ) : null}
              {!connection?.authorised && !isLocked ? (
                <Button asChild size="lg">
                  <Link href="/connection">Connect Claude first</Link>
                </Button>
              ) : null}
              <RecheckButton size="lg" />
            </div>
          </div>

          <div className="space-y-6">
            <ModuleRunPanel context={context} />
            <ExpectedOutputCard artifacts={entry.expectedArtifacts} />
          </div>
        </section>
      ) : null}

      {/* Live module, no Run yet: still show what it's about. */}
      {isLive && !runModule ? (
        <section className="mt-8 grid gap-8 lg:grid-cols-[1fr_22rem]">
          <div className="rounded-[2rem] border border-border bg-card p-8 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              What this module does
            </h2>
            <p className="mt-4 text-base leading-7 text-muted-foreground">
              {entry.description ?? "No description yet."}
            </p>
            {entry.objective ? (
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                {entry.objective}
              </p>
            ) : null}
          </div>
          <ExpectedOutputCard artifacts={entry.expectedArtifacts} />
        </section>
      ) : null}
    </main>
  );
}
