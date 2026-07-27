import Link from "next/link";

import { getLatestValidation } from "@ai-catalyst/services/artifact";
import type { ModuleCatalogEntry, RunModuleSummary } from "@ai-catalyst/shared";

import { Button } from "@/components/ui/button";
import { getActiveContext } from "@/lib/active-context";
import { getCurrentFounderActor } from "@/lib/current-founder-actor";
import { getMcpConnectionStatus } from "@/lib/mcp-connection";
import { getModuleContextByKey, listRunModules } from "@/lib/run-modules";
import { ventureForActiveContext } from "@/lib/ventures";
import { hasPendingSetupModule } from "@/lib/ensure-program-destination";
import { getFounderArtifactDocument } from "@/lib/artifacts";

import { MarkdownDocument } from "../../../components/markdown-document";

import { ContinueProgrammeButton } from "../../../components/continue-programme-button";
import { StatusBadge } from "../../../components/status-badge";
import { moduleGateCopy } from "../../../lib/copy";
import {
  DECISION_QUESTION_KEYS,
  deriveModuleDisplayStatus,
  moduleAccentStyle,
  needsModuleRetry,
  startModulePrompt,
} from "../../../lib/module-display";
import { StatusPill } from "../../components/status-pill";
import { Module0Setup } from "./module0-setup";
import { Module1Run } from "./module1-run";
import { RetryPassCard } from "./retry-pass-card";
import { ValidationIssuesCard } from "./validation-issues-card";

type ModuleDetailBodyProps = {
  moduleKey: string;
  entry: ModuleCatalogEntry;
};

export async function ModuleDetailBody({
  moduleKey,
  entry,
}: ModuleDetailBodyProps) {
  const actor = await getCurrentFounderActor();
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
  // After validation_failed, activeAttemptId is cleared; displayAttempt
  // still points at the failed Attempt so we can show answers + issues.
  const displayAttempt = context?.displayAttempt ?? activeAttempt;
  const needsRetry =
    runModule !== null &&
    needsModuleRetry(
      runModule.status,
      activeAttempt?.status ?? null,
      displayAttempt?.status ?? null,
    );
  const isSetupModule = entry.moduleType === "setup";
  const isLocked = runModule?.status === "locked";
  const isCompleted = runModule?.status === "completed";
  const verdictReady =
    activeAttempt?.status === "ready_for_review" ||
    displayAttempt?.status === "ready_for_review";
  const awaitingConfirmation =
    verdictReady && runModule !== null && context !== null && !needsRetry;

  const nextModuleTitle = runModule
    ? (runResult.modules.find((m) => m.sequenceIndex > runModule.sequenceIndex)
        ?.title ?? null)
    : null;

  const primaryArtifactKey = context?.artifacts[0]?.artifactKey ?? null;
  const needsValidation =
    displayAttempt?.status === "validation_failed" &&
    primaryArtifactKey !== null;
  const needsRunSetup = isLive && !runModule;
  const setupPending = hasPendingSetupModule(runResult.modules);

  // Needed whenever a live Module shows Claude open buttons — Module 0
  // for project setup, and Module 1+ to reopen the same project UUID
  // saved on the Venture. Skipping this left Module 1 with
  // claudeProjectId=null forever, so buttons never deep-linked the project.
  const needsVenture = needsRunSetup || (isLive && runModule !== null);
  const activeContextPromise = needsVenture
    ? getActiveContext(actor)
    : Promise.resolve(null);

  const [validation, activeContext] = await Promise.all([
    needsValidation && displayAttempt
      ? getLatestValidation(actor, {
          attemptId: displayAttempt.id,
          artifactKey: primaryArtifactKey,
        })
      : Promise.resolve(null),
    activeContextPromise,
  ]);

  const failedValidation =
    validation && validation.status === "failed" ? validation : null;

  // The saved document, read here rather than in the step that shows it:
  // Module1Run is a client component, and rendering the Markdown on the
  // server keeps react-markdown out of this page's client bundle. Only
  // fetched once something has actually been saved.
  const savedArtifact = context?.artifacts.find(
    (artifact) => artifact.latestSubmission !== null,
  );
  const artifactDocument =
    isLive && savedArtifact
      ? await getFounderArtifactDocument(
          actor,
          moduleKey,
          savedArtifact.artifactKey,
        )
      : null;
  const venture = activeContext
    ? await ventureForActiveContext(actor, activeContext)
    : null;

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
  return (
    <>
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
              displayAttempt?.status ?? null,
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

      {/* No Run yet, and the reason matters. Without a connection the
          Continue button has nothing it can do — ensureActiveProgramDestination
          returns not_connected and the founder gets an error toast for
          pressing the only button on the page. Send them to the step that
          actually unblocks them instead. */}
      {isLive && !runModule ? (
        <div className="mt-10 max-w-3xl rounded-xl border border-border bg-card p-8 shadow-sm">
          <h2 className="font-serif text-xl font-medium tracking-[-0.01em] text-foreground">
            {connection?.authorised
              ? moduleGateCopy.needsRunTitle
              : moduleGateCopy.needsConnectionTitle}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {connection?.authorised
              ? moduleGateCopy.needsRunBody
              : moduleGateCopy.needsConnectionBody}
          </p>
          {connection?.authorised ? (
            <ContinueProgrammeButton
              className="mt-6"
              label={moduleGateCopy.needsRunCta}
              pendingLabel="Setting things up…"
            />
          ) : (
            <Button asChild size="lg" className="mt-6">
              <Link href="/connection">
                {moduleGateCopy.needsConnectionCta}
              </Link>
            </Button>
          )}
        </div>
      ) : null}

      {/* Two different locks, and telling them apart matters. A module
          waiting on the one before it is a normal, self-resolving state.
          A module waiting on the hidden setup module is a dead end: the
          founder is told to finish something that no longer appears
          anywhere, so they get the button that finishes it for them. */}
      {isLocked && setupPending ? (
        <div className="mt-10 max-w-3xl rounded-xl border border-border bg-card p-8 shadow-sm">
          <h2 className="font-serif text-xl font-medium tracking-[-0.01em] text-foreground">
            {moduleGateCopy.setupPendingTitle}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {moduleGateCopy.setupPendingBody}
          </p>
          <ContinueProgrammeButton
            className="mt-6"
            label={moduleGateCopy.setupPendingCta}
            pendingLabel="Setting things up…"
          />
        </div>
      ) : isLocked ? (
        <div className="mt-10 flex max-w-3xl flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-muted/40 p-6">
          <p className="text-sm leading-6 text-muted-foreground">
            <span className="font-semibold text-foreground">
              {moduleGateCopy.lockedLead}
            </span>{" "}
            {moduleGateCopy.lockedBody}
          </p>
          <Button asChild variant="outline" className="shrink-0">
            <Link href="/modules">{moduleGateCopy.backToModules}</Link>
          </Button>
        </div>
      ) : null}

      {/* A "your setup from Module 0 carries over" reassurance used to sit
          here. It reassured about a module the founder now never sees, and
          it answered a worry nobody had: nothing in the UI ever suggested
          they would have to re-explain themselves. */}
      {runModule && context ? (
        isSetupModule ? (
          <section className="mt-8 space-y-6">
            {failedValidation ? (
              <ValidationIssuesCard validation={failedValidation} />
            ) : null}
            {needsRetry ? (
              <RetryPassCard
                programRunModuleId={runModule.id}
                moduleIndex={entry.sequenceIndex}
              />
            ) : null}
            <Module0Setup
              moduleKey={entry.moduleKey}
              moduleIndex={entry.sequenceIndex}
              programRunModuleId={runModule.id}
              claudeProjectId={venture?.claudeProjectId ?? null}
              connected={Boolean(connection?.authorised)}
              hasMcpActivity={Boolean(connection?.lastActivityAt)}
              artifactKey={context.artifacts[0]?.artifactKey ?? null}
              artifactName={context.artifacts[0]?.name ?? null}
              artifactVersion={
                context.artifacts[0]?.latestSubmission?.versionNumber ?? null
              }
              artifactSavedAt={
                context.artifacts[0]?.latestSubmission?.submittedAt ?? null
              }
              expectedArtifacts={entry.expectedArtifacts}
              awaitingConfirmation={awaitingConfirmation}
              isCompleted={isCompleted}
              needsRetry={needsRetry}
              startPrompt={startPrompt}
              nextModuleTitle={nextModuleTitle}
            />
          </section>
        ) : (
          <section className="mt-8 space-y-6">
            {failedValidation ? (
              <ValidationIssuesCard validation={failedValidation} />
            ) : null}
            <Module1Run
              moduleKey={entry.moduleKey}
              moduleIndex={entry.sequenceIndex}
              programRunModuleId={runModule.id}
              ventureId={venture?.id ?? null}
              claudeProjectId={venture?.claudeProjectId ?? null}
              connected={Boolean(connection?.authorised)}
              coreQuestions={coreQuestions}
              decisionQuestions={decisionQuestions}
              artifactKey={context.artifacts[0]?.artifactKey ?? null}
              artifactName={context.artifacts[0]?.name ?? null}
              artifactVersion={
                context.artifacts[0]?.latestSubmission?.versionNumber ?? null
              }
              artifactSavedAt={
                context.artifacts[0]?.latestSubmission?.submittedAt ?? null
              }
              expectedArtifacts={entry.expectedArtifacts}
              hasAttempt={activeAttempt !== null}
              needsRetry={needsRetry}
              awaitingConfirmation={awaitingConfirmation}
              documentPreview={
                artifactDocument ? (
                  <MarkdownDocument content={artifactDocument.content} />
                ) : null
              }
              isCompleted={isCompleted}
              preview={isLocked ? "locked" : null}
              startPrompt={startPrompt}
              nextModuleTitle={nextModuleTitle}
            />
          </section>
        )
      ) : null}

      {/* No Run yet: show the module itself, read-only, rather than a
          summary of it.

          What used to sit here was the seeded `description` and
          `objective` — text written for the content spec and for Claude,
          not for a founder. It read "a locked-schema Pressure-Test Verdict
          with AI Recommendation" and "Help the Founder test whether…",
          third person and all. Someone deciding whether to connect Claude
          was being shown the module's internal blurb instead of the module. */}
      {isLive && !runModule && !isSetupModule ? (
        <section className="mt-8">
          <Module1Run
            moduleKey={entry.moduleKey}
            moduleIndex={entry.sequenceIndex}
            programRunModuleId={null}
            ventureId={null}
            claudeProjectId={null}
            connected={Boolean(connection?.authorised)}
            coreQuestions={[]}
            decisionQuestions={[]}
            artifactKey={null}
            artifactName={null}
            artifactVersion={null}
            artifactSavedAt={null}
            expectedArtifacts={entry.expectedArtifacts}
            hasAttempt={false}
            needsRetry={false}
            awaitingConfirmation={false}
            documentPreview={null}
            isCompleted={false}
            preview="not-started"
            startPrompt={startPrompt}
            nextModuleTitle={nextModuleTitle}
          />
        </section>
      ) : null}
    </>
  );
}
