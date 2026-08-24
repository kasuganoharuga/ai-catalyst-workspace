import Link from "next/link";

import type { ModuleCatalogEntry } from "@ai-catalyst/shared";

import { Button } from "@/components/ui/button";
import { getCurrentFounderActor } from "@/lib/current-founder-actor";
import { getMyProfile } from "@/lib/user-profile";

import { ContinueProgrammeButton } from "../../../components/continue-programme-button";
import { MarkdownDocument } from "../../../components/markdown-document";
import { moduleGateCopy } from "../../../lib/copy";
import { listPrepDocuments } from "@ai-catalyst/services/prep";

import { loadModuleDetail } from "../lib/load-module-detail";
import { module1RunProps } from "../lib/module1-run-props";
import type { ModuleArtifactView, PrepDocumentView } from "../types";
import { ModuleDetailHeader } from "./module-detail-header";
import { Module0Setup } from "./module0/module0-setup";
import { Module1Run } from "./module1/module1-run";
import { ModuleGateCard } from "./shared/module-gate-card";
import { ModuleRunSection } from "./shared/module-run-section";

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

  const sharedRunProps = {
    moduleKey: entry.moduleKey,
    moduleIndex: entry.sequenceIndex,
    provider,
    connected: Boolean(connection?.authorised),
    artifacts: artifactViews,
    prepDocuments,
    startPrompt,
    nextModuleTitle,
  };

  return (
    <>
      <ModuleDetailHeader
        entry={entry}
        isCompleted={isCompleted}
        runModule={runModule}
        activeAttempt={activeAttempt}
        displayAttempt={displayAttempt}
      />

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
        <ModuleGateCard
          title={moduleGateCopy.missingFromRunTitle}
          body={moduleGateCopy.missingFromRunBody}
        >
          <Button asChild variant="outline" size="lg" className="mt-6">
            <Link href="/modules">{moduleGateCopy.backToModules}</Link>
          </Button>
        </ModuleGateCard>
      ) : null}

      {/* Without a connection, Continue only surfaces an error toast. */}
      {isLive && !runModule && !moduleMissingFromExistingRun ? (
        <ModuleGateCard
          title={
            connection?.authorised
              ? moduleGateCopy.needsRunTitle
              : moduleGateCopy.needsConnectionTitle
          }
          body={
            connection?.authorised
              ? moduleGateCopy.needsRunBody
              : moduleGateCopy.needsConnectionBody
          }
        >
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
        </ModuleGateCard>
      ) : null}

      {/* Hidden setup still open is a dead end without the ensure action. */}
      {isLocked && setupPending ? (
        <ModuleGateCard
          title={moduleGateCopy.setupPendingTitle}
          body={moduleGateCopy.setupPendingBody}
        >
          <ContinueProgrammeButton
            className="mt-6"
            label={moduleGateCopy.setupPendingCta}
            pendingLabel="Setting things up…"
          />
        </ModuleGateCard>
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
          <ModuleRunSection
            failedValidations={failedValidations}
            needsRetry={needsRetry}
            programRunModuleId={runModule.id}
            moduleIndex={entry.sequenceIndex}
          >
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
          </ModuleRunSection>
        ) : (
          <ModuleRunSection
            failedValidations={failedValidations}
            needsRetry={needsRetry}
            programRunModuleId={runModule.id}
            moduleIndex={entry.sequenceIndex}
          >
            {/* Module 4 used to render its own interview-evidence panel
                here. Interview material is now uploaded as prep documents
                on the Work step like any other module's, so Module 4 goes
                through the same three-card wizard as the rest. */}
            <Module1Run
              {...module1RunProps(sharedRunProps, {
                programRunModuleId: runModule.id,
                ventureId: venture?.id ?? null,
                claudeProjectId: venture?.claudeProjectId ?? null,
                coreQuestions,
                interviewGate: context.interviewGate,
                hasAttempt: activeAttempt !== null,
                needsRetry,
                awaitingConfirmation,
                isCompleted,
                preview: isLocked ? "locked" : null,
              })}
            />
          </ModuleRunSection>
        )
      ) : null}

      {/* No run yet: show the module read-only instead of internal seed blurbs. */}
      {isLive && !runModule && !isSetupModule ? (
        <section className="mt-8">
          <Module1Run
            {...module1RunProps(sharedRunProps, {
              programRunModuleId: null,
              ventureId: null,
              claudeProjectId: null,
              coreQuestions: [],
              interviewGate: null,
              hasAttempt: false,
              needsRetry: false,
              awaitingConfirmation: false,
              isCompleted: false,
              preview: "not-started",
            })}
          />
        </section>
      ) : null}
    </>
  );
}
