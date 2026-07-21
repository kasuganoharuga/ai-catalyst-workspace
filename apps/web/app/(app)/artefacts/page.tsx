import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getCurrentFounderActor } from "@/lib/current-founder-actor";
import { listModuleCatalog } from "@/lib/module-catalog";
import { appPageTitle } from "@/lib/page-metadata";
import { listModuleContextsForActiveRun } from "@/lib/run-modules";

import { PageShell } from "../components/page-shell";
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

  const groups: ArtefactModuleGroupModel[] = contexts
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
          Your workspace
        </p>
        <h1 className="mt-4 font-serif text-[2.25rem] font-medium leading-tight tracking-[-0.02em]">
          Everything your modules produce
        </h1>
        <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
          Each module ends with one or more documents Claude saves into your
          workspace. They live here — versioned, checked, and ready whenever you
          come back.
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="mt-10 rounded-xl border border-border bg-muted/40 p-8 text-center">
          <p className="text-[15px] leading-7 text-muted-foreground">
            Nothing here yet — artefacts appear as you work through modules in
            Claude. Module 0 saves your first one.
          </p>
          <Button asChild size="lg" className="mt-6">
            <Link href="/modules">Go to modules</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-10 flex items-baseline justify-between gap-4 border-t border-border pt-4">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              By module
            </p>
            <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {savedCount} of {totalArtefacts} saved
            </p>
          </div>

          <div className="mt-5 flex flex-col gap-5">
            {groups.map((group) => (
              <ArtefactModuleGroup key={group.moduleKey} group={group} />
            ))}
          </div>

          <p className="mt-8 text-sm leading-6 text-muted-foreground">
            Files are stored in your workspace — nothing lives only in the chat.
          </p>
        </>
      )}
    </PageShell>
  );
}
