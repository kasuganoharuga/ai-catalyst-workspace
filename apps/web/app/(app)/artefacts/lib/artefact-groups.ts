import type {
  ModuleCatalogEntry,
  ModuleContext,
  RunModuleStatus,
} from "@ai-catalyst/shared";

import { artefactsCopy } from "../../lib/copy";
import { MODULE_4_KEY } from "../../lib/module-display";
import type {
  ArtefactCardModel,
  ArtefactModuleGroupModel,
  ArtefactStartAction,
} from "../types";

type HandoffSpec = {
  /** The module that owns the artefact definition. */
  moduleKey: string;
  artifactKey: string;
  /** Between which two modules the card lands — see `sortIndex` on the model. */
  sortIndex: number;
  title: string;
  subtitle: string;
};

// Interview notes belong to Module 4 in the database (that is where they are
// handed over and graded), but on this page they read as what the founder
// carries out of Module 3 — so they leave Module 4's group and sit between
// the two.
const HANDOFF_ARTEFACTS: HandoffSpec[] = [
  {
    moduleKey: MODULE_4_KEY,
    artifactKey: "interview_notes",
    sortIndex: 3.5,
    title: artefactsCopy.interviewNotesTitle,
    subtitle: artefactsCopy.interviewNotesSubtitle,
  },
];

/**
 * Lifts handoff artefacts out of their owning module's group into cards of
 * their own, then orders everything by `sortIndex`. A module left with no
 * artefacts of its own drops out rather than rendering an empty card.
 */
function splitHandoffGroups(
  groups: ArtefactModuleGroupModel[],
): ArtefactModuleGroupModel[] {
  const result: ArtefactModuleGroupModel[] = [];

  for (const group of groups) {
    const specs = HANDOFF_ARTEFACTS.filter(
      (spec) => spec.moduleKey === group.moduleKey,
    );
    if (specs.length === 0) {
      result.push(group);
      continue;
    }

    const handoffKeys = new Set(specs.map((spec) => spec.artifactKey));
    const ownArtefacts = group.artefacts.filter(
      (artefact) => !handoffKeys.has(artefact.artifactKey),
    );
    if (ownArtefacts.length > 0) {
      result.push({ ...group, artefacts: ownArtefacts });
    }

    for (const spec of specs) {
      const artefacts = group.artefacts.filter(
        (artefact) => artefact.artifactKey === spec.artifactKey,
      );
      if (artefacts.length === 0) continue;
      result.push({
        kind: "handoff",
        moduleKey: group.moduleKey,
        title: spec.title,
        subtitle: spec.subtitle,
        sequenceIndex: group.sequenceIndex,
        sortIndex: spec.sortIndex,
        artefacts,
      });
    }
  }

  return result.sort((a, b) => a.sortIndex - b.sortIndex);
}

function isVisibleModule(
  entry: ModuleCatalogEntry | undefined,
  showSetupModule: boolean,
) {
  return showSetupModule || entry?.moduleType !== "setup";
}

/** Modules a Founder can open to produce an unsaved artefact. */
function isStartableRunStatus(status: RunModuleStatus): boolean {
  return status === "available" || status === "in_progress";
}

function startActionForUnsaved(
  moduleKey: string,
  status: RunModuleStatus,
): ArtefactStartAction {
  if (isStartableRunStatus(status)) {
    return { kind: "start", href: `/modules/${encodeURIComponent(moduleKey)}` };
  }
  return { kind: "locked" };
}

/** Groups saved artefacts from the active run, hiding setup unless flagged. */
export function buildSavedArtefactGroups(
  contexts: ModuleContext[],
  catalog: ModuleCatalogEntry[],
  showSetupModule: boolean,
): ArtefactModuleGroupModel[] {
  const catalogByKey = new Map(
    catalog.map((entry) => [entry.moduleKey, entry]),
  );

  const moduleGroups = contexts
    .filter((context) =>
      isVisibleModule(
        catalogByKey.get(context.runModule.moduleKey),
        showSetupModule,
      ),
    )
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
          const versionNumber =
            artifact.latestSubmission?.versionNumber ?? null;
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
            versionNumber,
            submissionStatus: artifact.latestSubmission?.status ?? null,
            savedAt: artifact.latestSubmission?.updatedAt ?? null,
            workbookAvailable: artifact.workbookAvailable,
            workbookFormat: artifact.workbookFormat,
            // Unsaved rows need a CTA — same Start/Locked affordance as the
            // pre-run preview path; without this the card renders empty actions.
            startAction:
              versionNumber === null
                ? startActionForUnsaved(
                    context.runModule.moduleKey,
                    context.runModule.status,
                  )
                : undefined,
          };
        },
      );

      return {
        kind: "module" as const,
        moduleKey: context.runModule.moduleKey,
        title: context.runModule.title,
        subtitle: entry?.subtitle ?? null,
        sequenceIndex: context.runModule.sequenceIndex,
        sortIndex: context.runModule.sequenceIndex,
        artefacts,
      };
    })
    .filter((group) => group.artefacts.length > 0);

  return splitHandoffGroups(moduleGroups);
}

/**
 * Catalog fallback before any run exists: same card layout, with Start on
 * the first live module and Locked on the rest.
 */
export function buildPreviewArtefactGroups(
  catalog: ModuleCatalogEntry[],
  showSetupModule: boolean,
): ArtefactModuleGroupModel[] {
  const catalogModules = catalog.filter((entry) =>
    isVisibleModule(entry, showSetupModule),
  );

  const nextStartableKey = catalogModules.find(
    (entry) =>
      entry.catalogStatus === "live" && entry.expectedArtifacts.length > 0,
  )?.moduleKey;

  const moduleGroups = catalogModules
    .filter((entry) => entry.expectedArtifacts.length > 0)
    .map((entry) => ({
      kind: "module" as const,
      moduleKey: entry.moduleKey,
      title: entry.title,
      subtitle: entry.subtitle,
      sequenceIndex: entry.sequenceIndex,
      sortIndex: entry.sequenceIndex,
      artefacts: entry.expectedArtifacts.map((artifact) => ({
        moduleKey: entry.moduleKey,
        moduleTitle: entry.title,
        moduleSubtitle: entry.subtitle,
        sequenceIndex: entry.sequenceIndex,
        artifactKey: artifact.artifactKey,
        name: artifact.name,
        requiredFilename: artifact.requiredFilename,
        isRequired: artifact.isRequired,
        versionNumber: null,
        submissionStatus: null,
        savedAt: null,
        // No Attempt exists yet in this pre-run preview, so a workbook can
        // never actually be downloaded here regardless of renderer support
        // — matches load-module-detail.ts's own pre-Run workbookAvailable
        // rule.
        workbookAvailable: false,
        workbookFormat: artifact.workbookFormat,
        startAction:
          entry.moduleKey === nextStartableKey
            ? ({
                kind: "start",
                href: `/modules/${encodeURIComponent(entry.moduleKey)}`,
              } as const)
            : ({ kind: "locked" } as const),
      })),
    }));

  return splitHandoffGroups(moduleGroups);
}

export function artefactCounts(groups: ArtefactModuleGroupModel[]) {
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
  return { totalArtefacts, savedCount };
}
