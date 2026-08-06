import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { resolveMcpProviderTag } from "@ai-catalyst/contracts/actor-context";
import type { ArtifactSubmissionCreatedVia } from "@ai-catalyst/shared";

import { ServiceError } from "@ai-catalyst/services/errors";

// Deliberately local to the artifact module, not a reuse of
// attempt/internal/interaction-provider.ts's resolveInteractionProvider
// or storage/internal's resolveStorageCreatedVia — same "don't share
// mappers across modules" convention those two already establish
// (storage/index.ts's own comment on resolveStorageCreatedVia spells out
// why). `artifact_submissions.created_via` has its own enum
// (website/claude/openai/other/renderer/system/import), a superset of the
// other two columns' domains, but this function only needs to produce
// the values actually reachable through saveArtifactSubmission's
// `assertRole(actor, ["founder"])` gate.
export function resolveSubmissionCreatedVia(actor: ActorContext): ArtifactSubmissionCreatedVia {
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
