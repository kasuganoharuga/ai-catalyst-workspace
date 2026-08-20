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
import type { ArtefactModuleGroupModel } from "./types";

export const metadata = appPageTitle("Artefacts");

// Interview records used to appear here as their own row between Module
// 3 and Proof. Interview material is now uploaded as prep documents on a
// module's Work step, so the list is modules only.
type ListItem = {
  kind: "module";
  sortIndex: number;
  group: ArtefactModuleGroupModel;
};

export default async function ArtefactsPage() {
  const actor = await getCurrentFounderActor();
  const [contexts, catalog] = await Promise.all([
    listModuleContextsForActiveRun(actor),
    listModuleCatalog(actor),
  ]);

  // Setup Summary is machine-written storage config, not founder work — hide
  // it from the list; its direct URL still resolves for support.
  const groups = buildSavedArtefactGroups(contexts, catalog, SHOW_SETUP_MODULE);
  const baseGroups =
    groups.length > 0
      ? groups
      : buildPreviewArtefactGroups(catalog, SHOW_SETUP_MODULE);
  const displayGroups = baseGroups;
  const hasSavedWork = groups.length > 0;
  const { totalArtefacts, savedCount } = artefactCounts(displayGroups);

  const items: ListItem[] = displayGroups.map((group) => ({
    kind: "module",
    sortIndex: group.sortIndex,
    group,
  }));

  items.sort((a, b) => a.sortIndex - b.sortIndex);

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

      {items.length > 0 ? (
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
            {items.map((item) => (
              <ArtefactModuleGroup
                key={`${item.group.moduleKey}:${item.group.sortIndex}`}
                group={item.group}
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
