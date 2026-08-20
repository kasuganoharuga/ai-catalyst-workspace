import { cache } from "react";

import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type { WorkbookFormat } from "@ai-catalyst/shared";
import { getArtifactSubmission } from "@ai-catalyst/services/artifact";
import { ServiceError } from "@ai-catalyst/services/errors";

import { getModuleContextByKey } from "./run-modules";

export type FounderArtifactDocument = {
  moduleKey: string;
  moduleTitle: string;
  artifactKey: string;
  name: string;
  requiredFilename: string | null;
  versionNumber: number;
  /** Prefer official submit time; fall back to last write for drafts. */
  savedAt: string;
  content: string;
  workbookAvailable: boolean;
  workbookFormat: WorkbookFormat | null;
};

/**
 * Loads the latest saved Artifact for a module on the Founder's active Run
 * (displayAttempt when set, else activeAttempt), including file content from
 * StorageService. Returns null when there is no attempt or no submission yet.
 */
export const getFounderArtifactDocument = cache(
  async (
    actor: ActorContext,
    moduleKey: string,
    artifactKey: string,
  ): Promise<FounderArtifactDocument | null> => {
    const context = await getModuleContextByKey(actor, moduleKey);
    if (!context) {
      return null;
    }

    const attemptId =
      context.displayAttempt?.id ?? context.activeAttempt?.id ?? null;
    if (!attemptId) {
      return null;
    }

    const summary = context.artifacts.find(
      (artifact) => artifact.artifactKey === artifactKey,
    );
    if (!summary?.latestSubmission) {
      return null;
    }

    let result;
    try {
      result = await getArtifactSubmission(actor, { attemptId, artifactKey });
    } catch (error) {
      if (error instanceof ServiceError && error.code === "NOT_FOUND") {
        return null;
      }
      throw error;
    }

    if (!result?.content) {
      return null;
    }

    return {
      moduleKey: context.runModule.moduleKey,
      moduleTitle: context.runModule.title,
      artifactKey: summary.artifactKey,
      name: summary.name,
      requiredFilename: summary.requiredFilename,
      versionNumber: result.submission.versionNumber,
      savedAt: result.submission.submittedAt ?? result.submission.createdAt,
      content: result.content,
      workbookAvailable: summary.workbookAvailable,
      workbookFormat: summary.workbookFormat,
    };
  },
);
