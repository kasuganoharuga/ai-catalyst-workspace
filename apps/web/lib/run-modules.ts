import { cache } from "react";

import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { getArtifactSubmission } from "@ai-catalyst/services/artifact";
import { ServiceError } from "@ai-catalyst/services/errors";
import { getModuleContext } from "@ai-catalyst/services/module/context";
import { listRunModules as listRunModulesUncached } from "@ai-catalyst/services/workflow";

// Thin Next.js shells over packages/services read paths — same pattern as
// lib/module-catalog.ts. Web stays on the read side of the Run/Attempt
// state machine; every write happens through MCP tools in the AI client.
export const listRunModules = cache(listRunModulesUncached);

// `null` (rather than a throw) when the Founder has no Run yet or the
// moduleKey has no program_run_modules row — both are normal pre-setup
// states the status pages render, not errors.
//
// getModuleContext joins Artifact submissions against the *active* Attempt
// only, and a completed Module has no active Attempt any more
// (completeModuleAttempt clears active_attempt_id) — so for completed
// Modules this re-reads each Artifact against the accepted Attempt, or the
// "Setup Summary saved" the Founder just earned would read "Not yet".
export const getModuleContextByKey = cache(
  async (actor: ActorContext, moduleKey: string) => {
    let context;
    try {
      context = await getModuleContext(actor, { moduleKey });
    } catch (error) {
      if (error instanceof ServiceError && error.code === "NOT_FOUND") {
        return null;
      }
      throw error;
    }

    const acceptedAttemptId = context.runModule.acceptedAttemptId;
    if (context.runModule.activeAttemptId !== null || !acceptedAttemptId) {
      return context;
    }

    const artifacts = await Promise.all(
      context.artifacts.map(async (artifact) => {
        const result = await getArtifactSubmission(actor, {
          attemptId: acceptedAttemptId,
          artifactKey: artifact.artifactKey,
        });
        if (!result) return artifact;
        return {
          ...artifact,
          latestSubmission: {
            versionNumber: result.submission.versionNumber,
            status: result.submission.status,
            submittedAt: result.submission.submittedAt,
          },
        };
      }),
    );
    return { ...context, artifacts };
  },
);
