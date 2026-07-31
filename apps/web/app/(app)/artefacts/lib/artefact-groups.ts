import type { ModuleCatalogEntry, ModuleContext } from "@ai-catalyst/shared";

import type { ArtefactCardModel, ArtefactModuleGroupModel } from "../types";

function isVisibleModule(
  entry: ModuleCatalogEntry | undefined,
  showSetupModule: boolean,
) {
  return showSetupModule || entry?.moduleType !== "setup";
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

  return contexts
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

  return catalogModules
    .filter((entry) => entry.expectedArtifacts.length > 0)
    .map((entry) => ({
      moduleKey: entry.moduleKey,
      moduleTitle: entry.title,
      moduleSubtitle: entry.subtitle,
      sequenceIndex: entry.sequenceIndex,
      artefacts: entry.expectedArtifacts.map((artifact) => ({
        moduleKey: entry.moduleKey,
        moduleTitle: entry.title,
        moduleSubtitle: entry.subtitle,
        sequenceIndex: entry.sequenceIndex,
        artifactKey: artifact.artifactKey,
        name: artifact.name,
        requiredFilename: artifact.requiredFilename,
        isRequired: true,
        versionNumber: null,
        submissionStatus: null,
        savedAt: null,
        startAction:
          entry.moduleKey === nextStartableKey
            ? ({
                kind: "start",
                href: `/modules/${entry.moduleKey}`,
              } as const)
            : ({ kind: "locked" } as const),
      })),
    }))
    .sort((a, b) => a.sequenceIndex - b.sequenceIndex);
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
