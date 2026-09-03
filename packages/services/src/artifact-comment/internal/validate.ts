import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type {
  ArtifactCommentAnchorKind,
  ArtifactCommentAuthorRole,
} from "@ai-catalyst/shared";

import { ServiceError } from "@ai-catalyst/services/errors";
import { listHeadings } from "@ai-catalyst/services/artifact/internal/markdown-sections";

export function assertValidBody(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    throw new ServiceError("VALIDATION_ERROR", "Comment body cannot be empty.");
  }
  if (trimmed.length > 4000) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "Comment body cannot exceed 4000 characters.",
    );
  }
  return trimmed;
}

export interface CommentAnchorInput {
  kind: ArtifactCommentAnchorKind;
  heading?: string | null;
  headingLevel?: number | null;
  quote?: string | null;
}

export function assertValidAnchor(
  anchor: CommentAnchorInput,
  markdown: string,
): { heading: string | null; headingLevel: number | null } {
  if (anchor.kind === "document") {
    if (anchor.heading != null || anchor.headingLevel != null) {
      throw new ServiceError(
        "VALIDATION_ERROR",
        "A document-anchored thread cannot carry a heading.",
      );
    }
    return { heading: null, headingLevel: null };
  }

  if (!anchor.heading || anchor.headingLevel == null) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "A section-anchored thread requires both heading and headingLevel.",
    );
  }
  const exists = listHeadings(markdown).some(
    (candidate) =>
      candidate.level === anchor.headingLevel &&
      candidate.heading.toLowerCase() === anchor.heading!.toLowerCase(),
  );
  if (!exists) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      `Heading "${anchor.heading}" was not found in the current Artifact.`,
    );
  }
  return { heading: anchor.heading, headingLevel: anchor.headingLevel };
}

export function authorRoleForActor(
  actor: ActorContext,
): ArtifactCommentAuthorRole {
  if (
    actor.role === "founder" ||
    actor.role === "mentor" ||
    actor.role === "admin"
  ) {
    return actor.role;
  }
  // assertRole already excludes every other role before this is reached.
  throw new ServiceError(
    "INTERNAL_INVARIANT_ERROR",
    `Unexpected actor role "${actor.role}" reached authorRoleForActor.`,
  );
}
