import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { getLatestValidation } from "@ai-catalyst/services/artifact";
import type { McpConnectionStatus } from "@ai-catalyst/services/mcp-auth";
import type {
  ArtifactValidation,
  ModuleCatalogEntry,
  ModuleContext,
  ModuleContextArtifactSummary,
  ModuleContextQuestion,
  RunModuleSummary,
  Venture,
} from "@ai-catalyst/shared";

import { getActiveContext } from "@/lib/active-context";
import { getFounderArtifactDocument } from "@/lib/artifacts";
import { hasPendingSetupModule } from "@/lib/ensure-program-destination";
import { getMcpConnectionStatus } from "@/lib/mcp-connection";
import { getModuleContextByKey, listRunModules } from "@/lib/run-modules";
import { ventureForActiveContext } from "@/lib/ventures";

import {
  DECISION_QUESTION_KEYS,
  needsModuleRetry,
  startModulePrompt,
} from "../../../lib/module-display";
import type { ExpectedArtifact, ModuleArtifactView } from "../types";

/**
 * Everything a `ModuleArtifactView` needs except the rendered
 * `documentPreview` — the Markdown content stays a plain string here, and
 * module-detail-body.tsx (a Server Component) wraps it in
 * `<MarkdownDocument>` right before handing it to `Module1Run`, the same
 * split the original single-artifact `artifactDocumentContent` field kept.
 */
export type ModuleArtifactDetail = Omit<
  ModuleArtifactView,
  "documentPreview"
> & {
  content: string | null;
};

export type ModuleDetailModel = {
  isLive: boolean;
  context: ModuleContext | null;
  connection: McpConnectionStatus | null;
  runModule: RunModuleSummary | null;
  /**
   * A Run already exists (the Founder is past setup) but it has no row for
   * this Module — reachable only when this Module's program_version postdates
   * the one the Founder's Run was created against (e.g. a v2 Run after v3
   * activates Modules 2-4). `ensureProgramDestination`/`ContinueProgrammeButton`
   * cannot fix this: it finds the existing Run and returns, so the founder
   * would click "Open module" and land right back here. Rendered as its own
   * honest state instead of the ordinary "needs a Run" gate.
   */
  moduleMissingFromExistingRun: boolean;
  activeAttempt: ModuleContext["activeAttempt"];
  displayAttempt: NonNullable<ModuleContext["displayAttempt"]> | null;
  needsRetry: boolean;
  isSetupModule: boolean;
  isLocked: boolean;
  isCompleted: boolean;
  awaitingConfirmation: boolean;
  nextModuleTitle: string | null;
  /** One entry per Artifact whose latest official validation failed. */
  failedValidations: ArtifactValidation[];
  setupPending: boolean;
  venture: Venture | null;
  coreQuestions: ModuleContextQuestion[];
  decisionQuestions: ModuleContextQuestion[];
  startPrompt: string;
  /** One entry per Artifact this Module produces, in sequence order. */
  artifacts: ModuleArtifactDetail[];
};

type ArtifactMetadata = Omit<ModuleArtifactView, "documentPreview">;

/**
 * Merges the catalog's static `outline` (Artifact structure, known even
 * before a Run exists) with the Run's real submission data (version,
 * saved-at) into one ordered view per Artifact — pure and unit-testable on
 * its own, with no document content or Markdown rendering involved.
 *
 * `contextArtifacts === null` means no Run exists yet (the catalog-only
 * preview path): every Artifact renders unsaved, in the catalog's own
 * order. Otherwise `contextArtifacts` is already the authoritative,
 * sequence-ordered list (one row per `artifact_definitions` row for this
 * Module — see packages/services/src/module/context.ts's
 * `loadArtifactsByModuleAttempts`), and `catalogArtifacts` is consulted
 * only for the `outline`, which `ModuleContextArtifactSummary` doesn't carry.
 */
export function buildArtifactMetadata(
  contextArtifacts: ModuleContextArtifactSummary[] | null,
  catalogArtifacts: ExpectedArtifact[],
): ArtifactMetadata[] {
  const outlineByKey = new Map(
    catalogArtifacts.map((artifact) => [
      artifact.artifactKey,
      artifact.outline,
    ]),
  );

  if (contextArtifacts === null) {
    return catalogArtifacts.map((artifact) => ({
      artifactKey: artifact.artifactKey,
      name: artifact.name,
      requiredFilename: artifact.requiredFilename,
      isRequired: artifact.isRequired,
      outline: artifact.outline,
      versionNumber: null,
      savedAt: null,
      workbookSupported: artifact.workbookSupported,
      // No Run/Attempt exists yet in this preview path, so no confirmed
      // version can exist either — always false here regardless of
      // workbookSupported.
      workbookAvailable: false,
      workbookFormat: artifact.workbookFormat,
    }));
  }

  return contextArtifacts.map((artifact) => ({
    artifactKey: artifact.artifactKey,
    name: artifact.name,
    requiredFilename: artifact.requiredFilename,
    isRequired: artifact.isRequired,
    outline: outlineByKey.get(artifact.artifactKey) ?? [],
    versionNumber: artifact.latestSubmission?.versionNumber ?? null,
    savedAt: artifact.latestSubmission?.submittedAt ?? null,
    workbookSupported: artifact.workbookSupported,
    workbookAvailable: artifact.workbookAvailable,
    workbookFormat: artifact.workbookFormat,
  }));
}

export async function loadModuleDetail(
  actor: ActorContext,
  moduleKey: string,
  entry: ModuleCatalogEntry,
): Promise<ModuleDetailModel> {
  const isLive = entry.catalogStatus === "live";
  const [context, connection, runResult] = isLive
    ? await Promise.all([
        getModuleContextByKey(actor, moduleKey),
        getMcpConnectionStatus(actor),
        listRunModules(actor),
      ])
    : [null, null, { runId: null, modules: [] as RunModuleSummary[] }];

  const runModule = context?.runModule ?? null;
  const activeAttempt = context?.activeAttempt ?? null;
  // After validation_failed, activeAttemptId is cleared; displayAttempt still holds answers.
  const displayAttempt = context?.displayAttempt ?? activeAttempt;
  const needsRetry =
    runModule !== null &&
    needsModuleRetry(
      runModule.status,
      activeAttempt?.status ?? null,
      displayAttempt?.status ?? null,
    );
  const isSetupModule = entry.moduleType === "setup";
  const isLocked = runModule?.status === "locked";
  const isCompleted = runModule?.status === "completed";
  const verdictReady =
    activeAttempt?.status === "ready_for_review" ||
    displayAttempt?.status === "ready_for_review";
  const awaitingConfirmation =
    verdictReady && runModule !== null && context !== null && !needsRetry;

  const nextModuleTitle = runModule
    ? (runResult.modules.find((m) => m.sequenceIndex > runModule.sequenceIndex)
        ?.title ?? null)
    : null;

  // Every Artifact's own official validation is checked, not just the
  // first — a Module with more than one Artifact (Modules 3 and 4) can have
  // one pass and the other fail, and the founder needs to see which.
  const needsValidation = displayAttempt?.status === "validation_failed";
  const needsRunSetup = isLive && !runModule;
  const moduleMissingFromExistingRun =
    needsRunSetup && runResult.runId !== null;
  const setupPending = hasPendingSetupModule(runResult.modules);

  // Needed for Claude deep-links whenever a live module can open a project.
  const needsVenture = needsRunSetup || (isLive && runModule !== null);
  const activeContextPromise = needsVenture
    ? getActiveContext(actor)
    : Promise.resolve(null);

  const artifactMetadata = buildArtifactMetadata(
    context?.artifacts ?? null,
    entry.expectedArtifacts,
  );

  const [validations, documents, activeContext] = await Promise.all([
    needsValidation && displayAttempt
      ? Promise.all(
          artifactMetadata.map((artifact) =>
            getLatestValidation(actor, {
              attemptId: displayAttempt.id,
              artifactKey: artifact.artifactKey,
            }).catch(() => null),
          ),
        )
      : Promise.resolve([]),
    // Load Markdown on the server so react-markdown stays out of the client bundle.
    isLive
      ? Promise.all(
          artifactMetadata.map((artifact) =>
            artifact.versionNumber !== null
              ? getFounderArtifactDocument(
                  actor,
                  moduleKey,
                  artifact.artifactKey,
                )
              : Promise.resolve(null),
          ),
        )
      : Promise.resolve([]),
    activeContextPromise,
  ]);

  const failedValidations = validations.filter(
    (validation): validation is ArtifactValidation =>
      validation !== null && validation.status === "failed",
  );

  const documentByArtifactKey = new Map(
    documents
      .filter(
        (document): document is NonNullable<typeof document> =>
          document !== null,
      )
      .map((document) => [document.artifactKey, document.content]),
  );
  const artifacts: ModuleArtifactDetail[] = artifactMetadata.map(
    (artifact) => ({
      ...artifact,
      content: documentByArtifactKey.get(artifact.artifactKey) ?? null,
    }),
  );

  const venture = activeContext
    ? await ventureForActiveContext(actor, activeContext)
    : null;

  const coreQuestions =
    context?.questions.filter(
      (q) => !DECISION_QUESTION_KEYS.has(q.questionKey),
    ) ?? [];
  const decisionQuestions =
    context?.questions.filter((q) =>
      DECISION_QUESTION_KEYS.has(q.questionKey),
    ) ?? [];

  return {
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
    decisionQuestions,
    startPrompt: startModulePrompt(
      `Module ${entry.sequenceIndex} · ${entry.title}`,
    ),
    artifacts,
  };
}
