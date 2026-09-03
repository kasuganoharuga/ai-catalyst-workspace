import { cache } from "react";

import { listArtifactCommentThreads as listArtifactCommentThreadsUncached } from "@ai-catalyst/services/artifact-comment";

// Thin Next.js shell over packages/services/artifact-comment, mirroring
// lib/mentor.ts: adds React's request-scoped cache() so a page and its
// metadata could each ask for the same thread list without a second round
// trip. No business logic here — authorization lives in the service, which
// re-checks the actor's access on every call regardless of which page asked.
export const listArtifactCommentThreads = cache(
  listArtifactCommentThreadsUncached,
);
