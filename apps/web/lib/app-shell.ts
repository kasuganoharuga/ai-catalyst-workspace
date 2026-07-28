import { cache } from "react";

import { getActiveContext } from "@/lib/active-context";
import {
  getCurrentFounderActor,
  getCurrentFounderSession,
} from "@/lib/current-founder-actor";
import { getMyProfile, resolveDisplayName } from "@/lib/user-profile";
import { ventureForActiveContext } from "@/lib/ventures";

export type AppShellUser = {
  displayName: string;
  email: string;
  ventureSubtitle: string;
};

export const loadAppShellUser = cache(async (): Promise<AppShellUser> => {
  const actor = await getCurrentFounderActor();
  const activeContextPromise = getActiveContext(actor);
  const [session, profile, venture] = await Promise.all([
    getCurrentFounderSession(),
    getMyProfile(actor),
    activeContextPromise.then((context) =>
      ventureForActiveContext(actor, context),
    ),
  ]);

  return {
    displayName: resolveDisplayName(profile, session.user.name),
    email: session.user.email,
    // "Venture" is the database's word for it. Founders have ideas — the
    // whole Workspace page is written that way (see workspaceCopy), and
    // this sits under their name on every single screen, so it was the most
    // visible place the internal noun was still showing.
    ventureSubtitle: venture?.name ?? "No idea selected",
  };
});
