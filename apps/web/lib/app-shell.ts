import { cache } from "react";

import type { PreferredAiProvider } from "@ai-catalyst/shared";

import { getActiveContext } from "@/lib/active-context";
import {
  getCurrentFounderActor,
  getCurrentFounderSession,
} from "@/lib/current-founder-actor";
import {
  getCurrentMentorActor,
  getCurrentMentorSession,
} from "@/lib/current-mentor-actor";
import { listMentorFounders } from "@/lib/mentor";
import { getMyProfile, resolveDisplayName } from "@/lib/user-profile";
import { ventureForActiveContext } from "@/lib/ventures";

export type AppShellUser = {
  role: "founder" | "mentor";
  displayName: string;
  email: string;
  /**
   * Shown under the name in the sidebar — what a Venture is to a Founder, a
   * count of Founders is to a Mentor. One field rather than two optional
   * ones because AppSidebar renders exactly one subtitle regardless of
   * role; which sentence fills it is decided here, once, rather than by
   * the sidebar component branching on role a second time.
   */
  subtitle: string;
  /**
   * Null for a Mentor: the first-run onboarding dialog (assistant choice,
   * invitation password, name) is a Founder-only concept, and this field is
   * exactly what the layout keys that dialog's visibility off. Never
   * fetched for a Mentor in the first place, rather than fetched and
   * ignored.
   */
  preferredAiProvider: PreferredAiProvider | null;
  /** Both name parts present. Decides whether the onboarding dialog asks
   * for them — meaningless for a Mentor, who never sees that dialog. */
  hasName: boolean;
};

async function loadFounderShellUser(): Promise<AppShellUser> {
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
    role: "founder",
    displayName: resolveDisplayName(profile, session.user.name),
    email: session.user.email,
    // "Venture" is the database's word for it. Founders have ideas — the
    // whole Workspace page is written that way (see workspaceCopy), and
    // this sits under their name on every single screen, so it was the most
    // visible place the internal noun was still showing.
    subtitle: venture?.name ?? "No idea selected",
    preferredAiProvider: profile.preferredAiProvider,
    // Same test as the dashboard's "Set up your profile" card, so the two
    // never disagree about whether the founder still owes us a name.
    hasName: Boolean(profile.firstName?.trim() && profile.lastName?.trim()),
  };
}

async function loadMentorShellUser(): Promise<AppShellUser> {
  const actor = await getCurrentMentorActor();
  const [session, profile, founders] = await Promise.all([
    getCurrentMentorSession(),
    getMyProfile(actor),
    listMentorFounders(actor),
  ]);

  return {
    role: "mentor",
    displayName: resolveDisplayName(profile, session.user.name),
    email: session.user.email,
    subtitle:
      founders.length === 0
        ? "No founders yet"
        : `${founders.length} founder${founders.length === 1 ? "" : "s"}`,
    preferredAiProvider: null,
    hasName: true,
  };
}

/**
 * Loads the signed-in user's sidebar data for the shared (app) shell.
 * `role` is supplied by the caller (the layout already knows it from
 * requireFounderOrMentorUser) rather than re-derived here, so this never
 * has to make its own authorization decision — it only decides which of
 * the two role-specific loaders to run.
 */
export const loadAppShellUser = cache(
  async (role: "founder" | "mentor"): Promise<AppShellUser> => {
    return role === "mentor" ? loadMentorShellUser() : loadFounderShellUser();
  },
);
