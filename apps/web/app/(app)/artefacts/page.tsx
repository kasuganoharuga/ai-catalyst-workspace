import {
  getInterviewActivityForProgramRun,
  getInterviewProgress,
} from "@ai-catalyst/services/interview";

import { getCurrentFounderActor } from "@/lib/current-founder-actor";
import { SHOW_SETUP_MODULE } from "@/lib/feature-flags";
import { listModuleCatalog } from "@/lib/module-catalog";
import { appPageTitle } from "@/lib/page-metadata";
import { listModuleContextsForActiveRun } from "@/lib/run-modules";

import { PageShell } from "../components/page-shell";
import { artefactsCopy } from "../lib/copy";
import { MODULE_4_KEY } from "../lib/module-display";
import { ArtefactModuleGroup } from "./components/artefact-module-group";
import { InterviewRecordsGroup } from "./components/interview-records-group";
import {
  applyInterviewEvidenceOverlay,
  artefactCounts,
  buildPreviewArtefactGroups,
  buildSavedArtefactGroups,
} from "./lib/artefact-groups";
import type { ArtefactModuleGroupModel } from "./types";

export const metadata = appPageTitle("Artefacts");

type ListItem =
  | { kind: "module"; sortIndex: number; group: ArtefactModuleGroupModel }
  | {
      kind: "interviews";
      sortIndex: number;
      completedCount: number;
      recommendedCount: number;
      requirementMet: boolean;
      confirmed: boolean;
      submitted: boolean;
      sequenceIndex: number;
      locked: boolean;
    };

export default async function ArtefactsPage() {
  const actor = await getCurrentFounderActor();
  const [contexts, catalog] = await Promise.all([
    listModuleContextsForActiveRun(actor),
    listModuleCatalog(actor),
  ]);

  const module4 = contexts.find(
    (context) => context.runModule.moduleKey === MODULE_4_KEY,
  );
  const module4Catalog = catalog.find(
    (entry) => entry.moduleKey === MODULE_4_KEY,
  );
  const programRunId = module4?.runModule.programRunId ?? null;
  const activity = programRunId
    ? await getInterviewActivityForProgramRun(actor, programRunId)
    : null;
  const progress = programRunId
    ? await getInterviewProgress(actor, programRunId)
    : null;

  // Setup Summary is machine-written storage config, not founder work — hide
  // it from the list; its direct URL still resolves for support.
  const groups = buildSavedArtefactGroups(contexts, catalog, SHOW_SETUP_MODULE);
  const baseGroups =
    groups.length > 0
      ? groups
      : buildPreviewArtefactGroups(catalog, SHOW_SETUP_MODULE);
  const displayGroups = applyInterviewEvidenceOverlay(
    baseGroups,
    module4 && progress
      ? {
          completedCount: progress.completedCount,
          evidenceStatus: progress.evidenceStatus,
          evidenceConfirmedAt: activity?.evidenceConfirmedAt ?? null,
          runStatus: module4.runModule.status,
        }
      : null,
  );
  const hasSavedWork = groups.length > 0;
  const { totalArtefacts, savedCount } = artefactCounts(displayGroups);

  const items: ListItem[] = displayGroups.map((group) => ({
    kind: "module",
    sortIndex: group.sortIndex,
    group,
  }));

  // Customer interviews sit between Module 3 and Proof.
  if (module4 || (module4Catalog && module4Catalog.catalogStatus === "live")) {
    items.push({
      kind: "interviews",
      sortIndex: 3.5,
      completedCount: progress?.completedCount ?? 0,
      recommendedCount: progress?.recommendedCount ?? 5,
      requirementMet: progress?.requirementMet ?? false,
      confirmed:
        (progress?.evidenceStatus ?? activity?.evidenceStatus) === "confirmed",
      submitted:
        (progress?.evidenceStatus ?? activity?.evidenceStatus) === "submitted",
      sequenceIndex: module4Catalog?.sequenceIndex ?? 4,
      locked: !activity,
    });
  }

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
            {items.map((item) =>
              item.kind === "module" ? (
                <ArtefactModuleGroup
                  key={`${item.group.moduleKey}:${item.group.sortIndex}`}
                  group={item.group}
                />
              ) : (
                <InterviewRecordsGroup
                  key="customer-interviews"
                  completedCount={item.completedCount}
                  recommendedCount={item.recommendedCount}
                  requirementMet={item.requirementMet}
                  confirmed={item.confirmed}
                  submitted={item.submitted}
                  sequenceIndex={item.sequenceIndex}
                  locked={item.locked}
                />
              ),
            )}
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
