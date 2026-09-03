import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type { ModuleContext, RunModuleSummary } from "@ai-catalyst/shared";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import {
  getRunModuleByKey,
  listRunModules,
} from "@ai-catalyst/services/workflow";
import {
  attemptHasAnsweredResponses,
  assembleModuleContext,
  isAttemptArtifactOwner,
} from "@ai-catalyst/services/module/internal/context-assemble";
import {
  loadArtifactsByModuleAttempts,
  loadAttemptsByIds,
  loadLatestAttemptIdsByRunModuleIds,
  loadPrepDocumentsByRunModuleIds,
  loadPromptsByModuleDefinitionIds,
  loadQuestionsByModuleDefinitionIds,
  loadResponsesByAttemptIds,
} from "@ai-catalyst/services/module/internal/context-loaders";

async function buildModuleContextsFromRunModules(
  runModules: RunModuleSummary[],
): Promise<ModuleContext[]> {
  if (runModules.length === 0) {
    return [];
  }

  const moduleDefinitionIds = runModules.map(
    (runModule) => runModule.moduleDefinitionId,
  );
  const runModuleIds = runModules.map((runModule) => runModule.id);

  const latestAttemptIdsByRunModule =
    await loadLatestAttemptIdsByRunModuleIds(runModuleIds);

  const fallbackDisplayAttemptIds = runModules.map((runModule) => {
    if (runModule.activeAttemptId) {
      return runModule.activeAttemptId;
    }
    if (runModule.acceptedAttemptId) {
      return runModule.acceptedAttemptId;
    }
    return latestAttemptIdsByRunModule.get(runModule.id) ?? null;
  });

  const seedAttemptIds = [
    ...new Set(
      [
        ...fallbackDisplayAttemptIds,
        ...runModules.map((runModule) => runModule.activeAttemptId),
      ].filter((id): id is string => id !== null),
    ),
  ];

  const [
    questionsByModuleDefinitionId,
    seedAttemptsById,
    promptsByModuleDefinitionId,
  ] = await Promise.all([
    loadQuestionsByModuleDefinitionIds([...new Set(moduleDefinitionIds)]),
    loadAttemptsByIds(seedAttemptIds),
    loadPromptsByModuleDefinitionIds([...new Set(moduleDefinitionIds)]),
  ]);

  // Empty Retry Attempts still need their based_on chain loaded so prior
  // answers remain visible on the checklist (one hop is not enough when
  // an intermediate Retry also never re-answered).
  const attemptsById = new Map(seedAttemptsById);
  let frontier = [...seedAttemptsById.values()]
    .map((row) => row.based_on_attempt_id)
    .filter((id): id is string => id !== null && !attemptsById.has(id));
  while (frontier.length > 0) {
    const next = await loadAttemptsByIds(frontier);
    for (const [id, row] of next) {
      attemptsById.set(id, row);
    }
    frontier = [...next.values()]
      .map((row) => row.based_on_attempt_id)
      .filter((id): id is string => id !== null && !attemptsById.has(id));
  }

  const attemptIdsToLoad = [...attemptsById.keys()];
  const responsesByAttemptId =
    await loadResponsesByAttemptIds(attemptIdsToLoad);

  // Artifacts follow the active Attempt whenever it owns its outputs
  // (submitted / ready_for_review / accepted) or already has answers.
  // Only an empty in-progress Retry falls back to based_on so prior
  // drafts remain visible while the Founder restarts.
  const artifactAttemptIds = runModules.map((runModule, index) => {
    const activeId = runModule.activeAttemptId;
    if (!activeId) {
      return fallbackDisplayAttemptIds[index] ?? null;
    }
    const active = attemptsById.get(activeId);
    if (active && isAttemptArtifactOwner(active.status)) {
      return activeId;
    }
    if (attemptHasAnsweredResponses(activeId, responsesByAttemptId)) {
      return activeId;
    }
    if (active?.based_on_attempt_id) {
      return active.based_on_attempt_id;
    }
    return activeId;
  });

  const [artifactsByModuleDefinitionId, prepDocumentsByRunModuleId] =
    await Promise.all([
      loadArtifactsByModuleAttempts(moduleDefinitionIds, artifactAttemptIds),
      // Keyed by run module, not by attempt: prep is uploaded on the Work
      // step before any attempt exists, and stays visible across retries.
      loadPrepDocumentsByRunModuleIds(runModuleIds),
    ]);

  return runModules.map((runModule, index) =>
    assembleModuleContext(
      runModule,
      fallbackDisplayAttemptIds[index] ?? null,
      attemptsById,
      questionsByModuleDefinitionId,
      responsesByAttemptId,
      artifactsByModuleDefinitionId,
      promptsByModuleDefinitionId,
      prepDocumentsByRunModuleId,
    ),
  );
}

/**
 * Loads every ModuleContext on the Founder's active Run in one pass:
 * resolves the Run once via listRunModules, then builds each context from
 * batched queries (questions, attempts, responses, artifacts, prompts).
 */
export async function listModuleContextsForActiveRun(
  actor: ActorContext,
): Promise<ModuleContext[]> {
  assertRole(actor, ["founder"]);
  const { modules } = await listRunModules(actor);
  return buildModuleContextsFromRunModules(modules);
}

/**
 * Loads everything a Facilitator (the AI client, via MCP) needs to run
 * one Module: the current Run/Module state, its active/display Attempt,
 * every active Question joined with that Attempt's Response, bound
 * Prompts, the resume point, and every Artifact's latest-version metadata.
 */
export async function getModuleContext(
  actor: ActorContext,
  input: unknown,
): Promise<ModuleContext> {
  assertRole(actor, ["founder"]);
  const runModule = await getRunModuleByKey(actor, input);
  const [context] = await buildModuleContextsFromRunModules([runModule]);
  if (!context) {
    throw new ServiceError(
      "INTERNAL_INVARIANT_ERROR",
      "Module context assembly returned no row.",
    );
  }
  return context;
}
