import Link from "next/link";

import type { ModuleCatalogEntry } from "@ai-catalyst/shared";

import { Button } from "@/components/ui/button";
import { getCurrentFounderActor } from "@/lib/current-founder-actor";
import { getMyProfile } from "@/lib/user-profile";

import { ContinueProgrammeButton } from "../../../components/continue-programme-button";
import { MarkdownDocument } from "../../../components/markdown-document";
import { StatusBadge } from "../../../components/status-badge";
import { moduleGateCopy } from "../../../lib/copy";
import {
  deriveModuleDisplayStatus,
  moduleAccentStyle,
} from "../../../lib/module-display";
import { StatusPill } from "../../components/status-pill";
import { listPrepDocuments } from "@ai-catalyst/services/prep";

import { loadModuleDetail } from "../lib/load-module-detail";
import type { ModuleArtifactView, PrepDocumentView } from "../types";
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
  // getMyProfile is cache()-wrapped and the app shell has already loaded
  // it for this request, so this is a map lookup rather than a query.
  const [detail, profile] = await Promise.all([
    loadModuleDetail(actor, moduleKey, entry),
    getMyProfile(actor),
  ]);
  const provider = profile.preferredAiProvider;
  const {
    isLive,
    context,
    connection,
    runModule,
    moduleMissingFromExistingRun,
    activeAttempt,
    displayAttempt,
    needsRetry,
    isSetupModule,
    isLocked,
    isCompleted,
    awaitingConfirmation,
    nextModuleTitle,
    failedValidations,
    setupPending,
    venture,
    coreQuestions,
    startPrompt,
    artifacts,
  } = detail;

  // MarkdownDocument construction happens here (a Server Component), not in
  // load-module-detail.ts, so that file stays free of react-markdown and
  // JSX — matches the pattern the original single-artifact
  // `artifactDocumentContent` field used.
  const artifactViews: ModuleArtifactView[] = artifacts.map((artifact) => ({
    ...artifact,
    documentPreview: artifact.content ? (
      <MarkdownDocument content={artifact.content} />
    ) : null,
  }));

  // Founder-uploaded prep for this module's Work step. Only meaningful
  // once a run module exists to attach it to — before that there is
  // nothing to upload against.
  const prepDocuments: PrepDocumentView[] = runModule
    ? (await listPrepDocuments(actor, runModule.id)).map((document) => ({
        id: document.id,
        filename: document.filename,
        contentType: document.contentType,
        sizeBytes: document.sizeBytes,
      }))
    : [];

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

      {/* An existing Run with no row for this Module — its program version
          postdates the Run's own, so "Open module" would find the existing
          Run and quietly return, leaving the founder right back here. This
          is its own honest state, not the ordinary "needs a Run" gate. */}
      {isLive && !runModule && moduleMissingFromExistingRun ? (
        <div className="mt-10 max-w-3xl rounded-xl border border-border bg-card p-8 shadow-sm">
          <h2 className="font-serif text-xl font-medium tracking-[-0.01em] text-foreground">
            {moduleGateCopy.missingFromRunTitle}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {moduleGateCopy.missingFromRunBody}
          </p>
          <Button asChild variant="outline" size="lg" className="mt-6">
            <Link href="/modules">{moduleGateCopy.backToModules}</Link>
          </Button>
        </div>
      ) : null}

      {/* Without a connection, Continue only surfaces an error toast. */}
      {isLive && !runModule && !moduleMissingFromExistingRun ? (
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

      {/* Hidden setup still open is a dead end without the ensure action. */}
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

      {runModule && context ? (
        isSetupModule ? (
          <section className="mt-8 space-y-6">
            {failedValidations.map((validation) => (
              <ValidationIssuesCard
                key={validation.id}
                validation={validation}
              />
            ))}
            {needsRetry ? (
              <RetryPassCard
                programRunModuleId={runModule.id}
                moduleIndex={entry.sequenceIndex}
              />
            ) : null}
            <Module0Setup
              moduleKey={entry.moduleKey}
              moduleIndex={entry.sequenceIndex}
              provider={provider}
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
            {failedValidations.map((validation) => (
              <ValidationIssuesCard
                key={validation.id}
                validation={validation}
              />
            ))}
            {needsRetry ? (
              <RetryPassCard
                programRunModuleId={runModule.id}
                moduleIndex={entry.sequenceIndex}
              />
            ) : null}
            {/* Module 4 used to render its own interview-evidence panel
                here. Interview material is now uploaded as prep documents
                on the Work step like any other module's, so Module 4 goes
                through the same three-card wizard as the rest. */}
            <Module1Run
              moduleKey={entry.moduleKey}
              moduleIndex={entry.sequenceIndex}
              provider={provider}
              programRunModuleId={runModule.id}
              ventureId={venture?.id ?? null}
              claudeProjectId={venture?.claudeProjectId ?? null}
              connected={Boolean(connection?.authorised)}
              coreQuestions={coreQuestions}
              artifacts={artifactViews}
              prepDocuments={prepDocuments}
              hasAttempt={activeAttempt !== null}
              needsRetry={needsRetry}
              awaitingConfirmation={awaitingConfirmation}
              isCompleted={isCompleted}
              preview={isLocked ? "locked" : null}
              startPrompt={startPrompt}
              nextModuleTitle={nextModuleTitle}
            />
          </section>
        )
      ) : null}

      {/* No run yet: show the module read-only instead of internal seed blurbs. */}
      {isLive && !runModule && !isSetupModule ? (
        <section className="mt-8">
          <Module1Run
            moduleKey={entry.moduleKey}
            moduleIndex={entry.sequenceIndex}
            provider={provider}
            programRunModuleId={null}
            ventureId={null}
            claudeProjectId={null}
            connected={Boolean(connection?.authorised)}
            coreQuestions={[]}
            artifacts={artifactViews}
            prepDocuments={prepDocuments}
            hasAttempt={false}
            needsRetry={false}
            awaitingConfirmation={false}
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
