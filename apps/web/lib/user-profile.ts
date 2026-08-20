import { cache } from "react";

import { getMyProfile as getMyProfileUncached } from "@ai-catalyst/services/profile";
import type { UserProfile } from "@ai-catalyst/shared";

// Thin Next.js shell over packages/services/profile — read path only,
// same pattern as lib/ventures.ts. Writes go through the server action
// in lib/actions/account-actions.ts.
export const getMyProfile = cache(getMyProfileUncached);

/**
 * The name to show in the UI. Prefers the profile's own first/last name
 * and falls back to the auth account's display name, so a Founder who
 * has never filled the profile in is never greeted by an empty string.
 */
export function resolveDisplayName(
  profile: Pick<UserProfile, "firstName" | "lastName"> | null,
  fallbackName: string,
): string {
  const parts = [profile?.firstName, profile?.lastName]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" ") : fallbackName;
}

/**
 * First name for greetings. Uses the profile's first name when set, and
 * otherwise takes the leading token of the fallback display name.
 */
export function resolveGreetingName(
  profile: Pick<UserProfile, "firstName"> | null,
  fallbackName: string,
): string {
  const firstName = profile?.firstName?.trim();
  if (firstName) return firstName;
  return fallbackName.trim().split(/\s+/)[0] || fallbackName;
}
