import { ServiceError } from "@ai-catalyst/services/errors";

export function normalizeCreatePendingGeneratedObjectInput(input: unknown): {
  workspaceId: string;
  filename: string;
} {
  if (typeof input !== "object" || input === null) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "workspaceId and filename are required.",
    );
  }
  const { workspaceId, filename } = input as {
    workspaceId?: unknown;
    filename?: unknown;
  };
  if (typeof workspaceId !== "string" || workspaceId.trim().length === 0) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "workspaceId must be a non-blank string.",
    );
  }
  if (typeof filename !== "string" || filename.trim().length === 0) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "filename must be a non-blank string.",
    );
  }
  return { workspaceId, filename };
}

export function normalizeWriteGeneratedTextContentInput(input: unknown): {
  storageObjectId: string;
  content: string;
} {
  if (typeof input !== "object" || input === null) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "storageObjectId and content are required.",
    );
  }
  const { storageObjectId, content } = input as {
    storageObjectId?: unknown;
    content?: unknown;
  };
  if (
    typeof storageObjectId !== "string" ||
    storageObjectId.trim().length === 0
  ) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "storageObjectId must be a non-blank string.",
    );
  }
  if (typeof content !== "string") {
    throw new ServiceError("VALIDATION_ERROR", "content must be a string.");
  }
  return { storageObjectId, content };
}

export function normalizeDeleteUnverifiedUploadInput(input: unknown): {
  storageObjectId: string;
} {
  if (typeof input !== "object" || input === null) {
    throw new ServiceError("VALIDATION_ERROR", "storageObjectId is required.");
  }
  const { storageObjectId } = input as { storageObjectId?: unknown };
  if (
    typeof storageObjectId !== "string" ||
    storageObjectId.trim().length === 0
  ) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "storageObjectId must be a non-blank string.",
    );
  }
  return { storageObjectId };
}
