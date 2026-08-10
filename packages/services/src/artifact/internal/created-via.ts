import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { resolveMcpProviderTag } from "@ai-catalyst/contracts/actor-context";
import type { ArtifactSubmissionCreatedVia } from "@ai-catalyst/shared";

import { ServiceError } from "@ai-catalyst/services/errors";

// Local mapper for artifact_submissions.created_via — not shared with attempt or storage mappers (same per-module convention).
// Only values reachable through saveArtifactSubmission's founder gate: website, claude, openai, other.
export function resolveSubmissionCreatedVia(
  actor: ActorContext,
): ArtifactSubmissionCreatedVia {
  if (actor.source === "mcp") {
    return resolveMcpProviderTag(actor);
  }
  if (actor.source === "web" || actor.source === undefined) {
    return "website";
  }
  // Structurally unreachable: saveArtifactSubmission only ever calls this
  // after assertRole(actor, ["founder"]), and a founder actor's source is
  // Founder submissions come from web or mcp only.
  throw new ServiceError(
    "INTERNAL_INVARIANT_ERROR",
    `Unexpected actor.source "${String(actor.source)}" for a founder Artifact submission.`,
  );
}
