import { ServiceError } from "@ai-catalyst/services/errors";

// Shared by getArtifactSubmission, runDraftCheck, and getLatestValidation —
// all three take the same (attemptId, artifactKey) input shape.
export function normalizeArtifactKeyInput(input: unknown): {
  attemptId: string;
  artifactKey: string;
} {
  if (typeof input !== "object" || input === null) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "attemptId and artifactKey are required.",
    );
  }
  const { attemptId, artifactKey } = input as {
    attemptId?: unknown;
    artifactKey?: unknown;
  };
  if (typeof attemptId !== "string" || attemptId.trim().length === 0) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "attemptId must be a non-blank string.",
    );
  }
  if (typeof artifactKey !== "string" || artifactKey.trim().length === 0) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "artifactKey must be a non-blank string.",
    );
  }
  return { attemptId, artifactKey };
}
