import { cache } from "react";

import { actorContextFromSession } from "./actor-context";
import { requireMentorUser } from "./require-active-user";

// Mentor counterpart of lib/current-founder-actor.ts — same reasoning:
// shared by the /mentor layout and every page under it, so React's cache()
// collapses what would otherwise be a session lookup per component down to
// one per request. A UX-layer convenience, not the security boundary —
// every packages/services call re-asserts the actor's role itself.
export const getCurrentMentorSession = cache(requireMentorUser);

export const getCurrentMentorActor = cache(async () => {
  const session = await getCurrentMentorSession();
  return actorContextFromSession(session);
});
