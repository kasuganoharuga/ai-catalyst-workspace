import { cache } from "react";

import { getActiveContext } from "@/lib/active-context";
import {
  getCurrentFounderActor,
  getCurrentFounderSession,
} from "@/lib/current-founder-actor";
import { getMyProfile, resolveDisplayName } from "@/lib/user-profile";
import { ventureForActiveContext } from "@/lib/ventures";

import type { PreferredAiProvider } from "@ai-catalyst/shared";

export type AppShellUser = {
  displayName: string;
  email: string;
  ventureSubtitle: string;
  /**
   * Null until the founder has chosen. The layout keys the first-run
   * dialog off this, which is why it is carried on the shell rather than
   * read again per page — `getMyProfile` is already loaded here.
   */
  preferredAiProvider: PreferredAiProvider | null;
  /** Both name parts present. Decides whether the dialog asks for them. */
  hasName: boolean;
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
    preferredAiProvider: profile.preferredAiProvider,
    // Same test as the dashboard's "Set up your profile" card, so the two
    // never disagree about whether the founder still owes us a name.
    hasName: Boolean(profile.firstName?.trim() && profile.lastName?.trim()),
  };
});
