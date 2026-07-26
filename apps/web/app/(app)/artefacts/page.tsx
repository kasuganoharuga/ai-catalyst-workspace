import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getCurrentFounderActor } from "@/lib/current-founder-actor";
import { listModuleCatalog } from "@/lib/module-catalog";
import { appPageTitle } from "@/lib/page-metadata";
import { listModuleContextsForActiveRun } from "@/lib/run-modules";
import { SHOW_SETUP_MODULE } from "@/lib/feature-flags";

import { PageShell } from "../components/page-shell";
import { artefactsCopy } from "../lib/copy";
import type {
  ArtefactCardModel,
  ArtefactModuleGroupModel,
} from "./components/artefact-card";
import { ArtefactModuleGroup } from "./components/artefact-module-group";

export const metadata = appPageTitle("Artefacts");

export default async function ArtefactsPage() {
  const actor = await getCurrentFounderActor();
  const [contexts, catalog] = await Promise.all([
    listModuleContextsForActiveRun(actor),
    listModuleCatalog(actor),
  ]);

  const catalogByKey = new Map(
    catalog.map((entry) => [entry.moduleKey, entry]),
  );

  // This page is framed as everything the founder's modules produce, and
  // the Setup Summary is not that: it is a machine-written report on their
  // own storage configuration, generated server-side, with nothing in it
  // for them to read or act on. Listing it pads the count with a document
  // they did not make. The direct URL still resolves, same as the setup
  // module's own page, so support can still pull it up.
  const visibleContexts = contexts.filter(
    (context) =>
      SHOW_SETUP_MODULE ||
      catalogByKey.get(context.runModule.moduleKey)?.moduleType !== "setup",
  );

  const groups: ArtefactModuleGroupModel[] = visibleContexts
    .map((context) => {
      const entry = catalogByKey.get(context.runModule.moduleKey);
      const expectedByKey = new Map(
        (entry?.expectedArtifacts ?? []).map((artifact) => [
          artifact.artifactKey,
          artifact,
        ]),
      );

      const artefacts: ArtefactCardModel[] = context.artifacts.map(
        (artifact) => {
          const expected = expectedByKey.get(artifact.artifactKey);
          return {
            moduleKey: context.runModule.moduleKey,
            moduleTitle: context.runModule.title,
            moduleSubtitle: entry?.subtitle ?? null,
            sequenceIndex: context.runModule.sequenceIndex,
            artifactKey: artifact.artifactKey,
            name: artifact.name,
            requiredFilename:
              artifact.requiredFilename ?? expected?.requiredFilename ?? null,
            isRequired: artifact.isRequired,
            versionNumber: artifact.latestSubmission?.versionNumber ?? null,
            submissionStatus: artifact.latestSubmission?.status ?? null,
            savedAt: artifact.latestSubmission?.updatedAt ?? null,
          };
        },
      );

      return {
        moduleKey: context.runModule.moduleKey,
        moduleTitle: context.runModule.title,
        moduleSubtitle: entry?.subtitle ?? null,
        sequenceIndex: context.runModule.sequenceIndex,
        artefacts,
      };
    })
    .filter((group) => group.artefacts.length > 0)
    .sort((a, b) => a.sequenceIndex - b.sequenceIndex);

  const totalArtefacts = groups.reduce(
    (count, group) => count + group.artefacts.length,
    0,
  );
  const savedCount = groups.reduce(
    (count, group) =>
      count +
      group.artefacts.filter((row) => row.versionNumber !== null).length,
    0,
  );

  return (
    <PageShell>
      <div className="max-w-2xl">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {artefactsCopy.kicker}
        </p>
        <h1 className="mt-4 font-serif text-[2.25rem] font-medium leading-tight tracking-[-0.02em]">
          {artefactsCopy.title}
        </h1>
        <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
          {artefactsCopy.intro}
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="mt-10 rounded-xl border border-border bg-muted/40 p-8 text-center">
          {/* Named Module 0 until it was hidden; the first document a
              founder ever sees is now Module 1's verdict. */}
          <p className="text-[15px] leading-7 text-muted-foreground">
            {artefactsCopy.empty}
          </p>
          <Button asChild size="lg" className="mt-6">
            <Link href="/modules">{artefactsCopy.emptyCta}</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-10 flex items-baseline justify-between gap-4 border-t border-border pt-4">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {artefactsCopy.byModule}
            </p>
            <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {artefactsCopy.savedCount(savedCount, totalArtefacts)}
            </p>
          </div>

          <div className="mt-5 flex flex-col gap-5">
            {groups.map((group) => (
              <ArtefactModuleGroup key={group.moduleKey} group={group} />
            ))}
          </div>

          <p className="mt-8 text-sm leading-6 text-muted-foreground">
            {artefactsCopy.storageNote}
          </p>
        </>
      )}
    </PageShell>
  );
}
