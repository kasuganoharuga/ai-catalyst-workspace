import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { getLatestValidation } from "@ai-catalyst/services/artifact";
import type { McpConnectionStatus } from "@ai-catalyst/services/mcp-auth";
import type {
  ArtifactValidation,
  ModuleCatalogEntry,
  ModuleContext,
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

export type ModuleDetailModel = {
  isLive: boolean;
  context: ModuleContext | null;
  connection: McpConnectionStatus | null;
  runModule: RunModuleSummary | null;
  activeAttempt: ModuleContext["activeAttempt"];
  displayAttempt: NonNullable<ModuleContext["displayAttempt"]> | null;
  needsRetry: boolean;
  isSetupModule: boolean;
  isLocked: boolean;
  isCompleted: boolean;
  awaitingConfirmation: boolean;
  nextModuleTitle: string | null;
  failedValidation: ArtifactValidation | null;
  setupPending: boolean;
  venture: Venture | null;
  coreQuestions: ModuleContextQuestion[];
  decisionQuestions: ModuleContextQuestion[];
  startPrompt: string;
  artifactDocumentContent: string | null;
};

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
    : [null, null, { modules: [] as RunModuleSummary[] }];

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

  const primaryArtifactKey = context?.artifacts[0]?.artifactKey ?? null;
  const needsValidation =
    displayAttempt?.status === "validation_failed" &&
    primaryArtifactKey !== null;
  const needsRunSetup = isLive && !runModule;
  const setupPending = hasPendingSetupModule(runResult.modules);

  // Needed for Claude deep-links whenever a live module can open a project.
  const needsVenture = needsRunSetup || (isLive && runModule !== null);
  const activeContextPromise = needsVenture
    ? getActiveContext(actor)
    : Promise.resolve(null);

  const [validation, activeContext] = await Promise.all([
    needsValidation && displayAttempt
      ? getLatestValidation(actor, {
          attemptId: displayAttempt.id,
          artifactKey: primaryArtifactKey,
        })
      : Promise.resolve(null),
    activeContextPromise,
  ]);

  const failedValidation =
    validation && validation.status === "failed" ? validation : null;

  // Load Markdown on the server so react-markdown stays out of the client bundle.
  const savedArtifact = context?.artifacts.find(
    (artifact) => artifact.latestSubmission !== null,
  );
  const artifactDocument =
    isLive && savedArtifact
      ? await getFounderArtifactDocument(
          actor,
          moduleKey,
          savedArtifact.artifactKey,
        )
      : null;

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
    activeAttempt,
    displayAttempt,
    needsRetry,
    isSetupModule,
    isLocked,
    isCompleted,
    awaitingConfirmation,
    nextModuleTitle,
    failedValidation,
    setupPending,
    venture,
    coreQuestions,
    decisionQuestions,
    startPrompt: startModulePrompt(
      `Module ${entry.sequenceIndex} · ${entry.title}`,
    ),
    artifactDocumentContent: artifactDocument?.content ?? null,
  };
}
