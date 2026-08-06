import { getCurrentFounderActor } from "@/lib/current-founder-actor";
import { SHOW_SETUP_MODULE } from "@/lib/feature-flags";
import { listModuleCatalog } from "@/lib/module-catalog";
import { appPageTitle } from "@/lib/page-metadata";
import { listModuleContextsForActiveRun } from "@/lib/run-modules";

import { PageShell } from "../components/page-shell";
import { artefactsCopy } from "../lib/copy";
import { ArtefactModuleGroup } from "./components/artefact-module-group";
import {
  artefactCounts,
  buildPreviewArtefactGroups,
  buildSavedArtefactGroups,
} from "./lib/artefact-groups";

export const metadata = appPageTitle("Artefacts");

export default async function ArtefactsPage() {
  const actor = await getCurrentFounderActor();
  const [contexts, catalog] = await Promise.all([
    listModuleContextsForActiveRun(actor),
    listModuleCatalog(actor),
  ]);

  // Setup Summary is machine-written storage config, not founder work — hide
  // it from the list; its direct URL still resolves for support.
  const groups = buildSavedArtefactGroups(contexts, catalog, SHOW_SETUP_MODULE);
  const displayGroups =
    groups.length > 0
      ? groups
      : buildPreviewArtefactGroups(catalog, SHOW_SETUP_MODULE);
  const hasSavedWork = groups.length > 0;
  const { totalArtefacts, savedCount } = artefactCounts(displayGroups);

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

      {displayGroups.length > 0 ? (
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
            {/* A handoff card shares its owning module's key, so the key has
                to carry position too. */}
            {displayGroups.map((group) => (
              <ArtefactModuleGroup
                key={`${group.moduleKey}:${group.sortIndex}`}
                group={group}
              />
            ))}
          </div>

          {hasSavedWork ? (
            <p className="mt-8 text-sm leading-6 text-muted-foreground">
              {artefactsCopy.storageNote}
            </p>
          ) : null}
        </>
      ) : null}
    </PageShell>
  );
}
