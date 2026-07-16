import { cache } from "react";

import { actorContextFromSession } from "./actor-context";
import { requireFounderUser } from "./require-active-user";

// Shared by the (app) layout, the sidebar, and every page under it — React's
// cache() deduplicates this to a single session lookup per request, so the
// Founder guard runs once even though each of them calls it independently.
// This is a UX-layer convenience, not the security boundary: every
// packages/services call re-asserts the actor's role itself.
export const getCurrentFounderSession = cache(requireFounderUser);

export const getCurrentFounderActor = cache(async () => {
  const session = await getCurrentFounderSession();
  return actorContextFromSession(session);
});
