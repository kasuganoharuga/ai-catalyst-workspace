import { cache } from "react";

import { actorContextFromSession } from "./actor-context";
import { requireFounderOrMentorUser } from "./require-active-user";

// Whichever of Founder/Mentor is signed in — the shared (app) shell's own
// guard, cached per request the same way current-founder-actor.ts and
// current-mentor-actor.ts cache their own role-specific guards. This is
// only for surfaces genuinely shared between both roles (the layout itself,
// and /dashboard's own role branch) — a page that must stay Founder- or
// Mentor-exclusive keeps calling getCurrentFounderActor() or
// getCurrentMentorActor() directly instead, which re-asserts the narrower
// role regardless of what this allowed through.
export const getCurrentAppSession = cache(requireFounderOrMentorUser);

export const getCurrentAppActor = cache(async () => {
  const session = await getCurrentAppSession();
  return actorContextFromSession(session);
});
