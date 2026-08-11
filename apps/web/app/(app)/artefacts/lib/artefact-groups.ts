import type {
  MentorArtefactSummary,
  ModuleCatalogEntry,
  ModuleContext,
  RunModuleStatus,
  RunModuleSummary,
} from "@ai-catalyst/shared";
import {
  INTERVIEW_EVIDENCE_ARTIFACT_KEY,
  MODULE_4_KEY,
  type InterviewEvidenceStatus,
} from "@ai-catalyst/services/interview";

import type {
  ArtefactCardModel,
  ArtefactModuleGroupModel,
  ArtefactStartAction,
} from "../types";

export type InterviewEvidenceOverlay = {
  completedCount: number;
  evidenceStatus: InterviewEvidenceStatus;
  evidenceConfirmedAt: string | null;
  /** Owning module run status — used to re-place the single Start CTA. */
  runStatus: RunModuleStatus;
};

type HandoffSpec = {
  /** The module that owns the artefact definition. */
  moduleKey: string;
  artifactKey: string;
  /** Between which two modules the card lands — see `sortIndex` on the model. */
  sortIndex: number;
  title: string;
  subtitle: string;
};

// Customer interview *forms* live at /artefacts/interviews (injected on the
// Artefacts page between Module 3 and Proof). Confirmed Interview-Evidence.md
// remains a Module 4 artefact row — not a between-module handoff card.
const HANDOFF_ARTEFACTS: HandoffSpec[] = [];

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

/**
 * One Start/Locked CTA per module group — every unsaved row linking to the
 * same module repeats the same button and reads as noise. Rows that already
 * have website evidence (draft preview / confirmed) are not Start targets.
 */
function assignSingleModuleStartAction(
  artefacts: ArtefactCardModel[],
  moduleKey: string,
  status: RunModuleStatus,
): ArtefactCardModel[] {
  let assigned = false;
  return artefacts.map((artefact) => {
    const needsStart =
      artefact.versionNumber === null && artefact.websiteEvidence == null;
    if (!needsStart) {
      return { ...artefact, startAction: undefined };
    }
    if (assigned) {
      return { ...artefact, startAction: undefined };
    }
    assigned = true;
    return {
      ...artefact,
      startAction: startActionForUnsaved(moduleKey, status),
    };
  });
}

/**
 * Mirror Proof's Customer Interview Evidence state onto the Artefacts row
 * before Claude pins a real submission.
 */
export function applyInterviewEvidenceOverlay(
  groups: ArtefactModuleGroupModel[],
  overlay: InterviewEvidenceOverlay | null,
): ArtefactModuleGroupModel[] {
  if (!overlay) return groups;

  return groups.map((group) => {
    if (group.moduleKey !== MODULE_4_KEY) return group;

    const artefacts = group.artefacts.map((artefact) => {
      if (artefact.artifactKey !== INTERVIEW_EVIDENCE_ARTIFACT_KEY) {
        return artefact;
      }
      // Real submission wins once Claude has materialised the file.
      if (artefact.versionNumber !== null) return artefact;

      if (overlay.evidenceStatus === "confirmed") {
        return {
          ...artefact,
          websiteEvidence: {
            status: "confirmed" as const,
            confirmedAt: overlay.evidenceConfirmedAt,
          },
        };
      }
      if (overlay.completedCount > 0) {
        return {
          ...artefact,
          websiteEvidence: {
            status: "draft_preview" as const,
            confirmedAt: null,
          },
        };
      }
      return { ...artefact, websiteEvidence: undefined };
    });

    return {
      ...group,
      artefacts: assignSingleModuleStartAction(
        artefacts,
        group.moduleKey,
        overlay.runStatus,
      ),
    };
  });
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

      const artefacts = assignSingleModuleStartAction(
        context.artifacts.map((artifact) => {
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
          };
        }),
        context.runModule.moduleKey,
        context.runModule.status,
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
      artefacts: assignSingleModuleStartAction(
        entry.expectedArtifacts.map((artifact) => ({
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
        })),
        entry.moduleKey,
        entry.moduleKey === nextStartableKey ? "available" : "locked",
      ),
    }));

  return splitHandoffGroups(moduleGroups);
}

function isArtefactPresent(row: ArtefactCardModel): boolean {
  return (
    row.versionNumber !== null || row.websiteEvidence?.status === "confirmed"
  );
}

export function artefactCounts(groups: ArtefactModuleGroupModel[]) {
  const totalArtefacts = groups.reduce(
    (count, group) => count + group.artefacts.length,
    0,
  );
  const savedCount = groups.reduce(
    (count, group) =>
      count + group.artefacts.filter((row) => isArtefactPresent(row)).length,
    0,
  );
  return { totalArtefacts, savedCount };
}

/**
 * Mentor detail: saved deliverables only, grouped like the Founder Artefacts
 * page. Mentors review finished work — no Start/Locked CTAs, no empty slots.
 */
export function buildMentorArtefactGroups(
  modules: RunModuleSummary[],
  artefacts: MentorArtefactSummary[],
): ArtefactModuleGroupModel[] {
  if (artefacts.length === 0) return [];

  const moduleByKey = new Map(modules.map((entry) => [entry.moduleKey, entry]));
  const byModule = new Map<string, MentorArtefactSummary[]>();

  for (const artefact of artefacts) {
    const list = byModule.get(artefact.moduleKey) ?? [];
    list.push(artefact);
    byModule.set(artefact.moduleKey, list);
  }

  return [...byModule.entries()]
    .map(([moduleKey, moduleArtefacts]) => {
      const runModule = moduleByKey.get(moduleKey);
      const sequenceIndex = runModule?.sequenceIndex ?? 0;
      return {
        kind: "module" as const,
        moduleKey,
        title: runModule?.title ?? moduleKey,
        subtitle: null,
        sequenceIndex,
        sortIndex: sequenceIndex,
        artefacts: moduleArtefacts.map((artefact) => ({
          moduleKey: artefact.moduleKey,
          moduleTitle: runModule?.title ?? moduleKey,
          moduleSubtitle: null,
          sequenceIndex,
          artifactKey: artefact.artifactKey,
          name: artefact.name,
          requiredFilename: artefact.requiredFilename,
          isRequired: true,
          versionNumber: artefact.versionNumber,
          submissionStatus: null,
          savedAt: artefact.savedAt,
          workbookAvailable: false,
          workbookFormat: null,
        })),
      };
    })
    .sort((a, b) => a.sortIndex - b.sortIndex);
}
