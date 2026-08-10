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
  /** Sidebar subtitle — venture name for Founders, founder count for Mentors. */
  subtitle: string;
  /** Founder-only onboarding input; null for Mentors (never fetched). */
  preferredAiProvider: PreferredAiProvider | null;
  /** Both name parts present; drives Founder onboarding dialog visibility. */
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
    subtitle: venture?.name ?? "No idea selected",
    preferredAiProvider: profile.preferredAiProvider,
    // Same test as dashboard profile card — keep dialog and card in sync.
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
 * Loads sidebar data for the shared (app) shell.
 * Caller supplies `role` from layout guards — this only picks the role-specific loader.
 */
export const loadAppShellUser = cache(
  async (role: "founder" | "mentor"): Promise<AppShellUser> => {
    return role === "mentor" ? loadMentorShellUser() : loadFounderShellUser();
  },
);
