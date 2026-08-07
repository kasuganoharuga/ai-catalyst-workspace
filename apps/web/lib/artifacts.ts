import { cache } from "react";

import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type { WorkbookFormat } from "@ai-catalyst/shared";
import {
  getArtifactSubmission,
  renderArtifactWorkbook,
} from "@ai-catalyst/services/artifact";
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

export type FounderArtifactWorkbook = {
  buffer: Buffer;
  mimeType: string;
  filename: string;
};

/**
 * Builds an on-demand workbook (fillable PDF) for the Founder's active Run
 * — see operational-workbooks plan §9. Resolves the attemptId the same way
 * getFounderArtifactDocument does; unlike that function, a business-rule
 * failure inside renderArtifactWorkbook (no renderer configured, source not
 * confirmed yet, integrity failure, render failure) is NOT swallowed to
 * null here — the caller (the download route) maps those ServiceErrors to
 * their own HTTP status via serviceErrorResponse, since each one is a
 * distinct, meaningful state the Founder or a support engineer needs to
 * see, not an interchangeable "not found".
 */
export async function getFounderArtifactWorkbook(
  actor: ActorContext,
  moduleKey: string,
  artifactKey: string,
  sectionCount?: number,
): Promise<FounderArtifactWorkbook | null> {
  const context = await getModuleContextByKey(actor, moduleKey);
  if (!context) {
    return null;
  }

  const attemptId =
    context.displayAttempt?.id ?? context.activeAttempt?.id ?? null;
  if (!attemptId) {
    return null;
  }

  return renderArtifactWorkbook(actor, {
    attemptId,
    artifactKey,
    sectionCount,
  });
}
