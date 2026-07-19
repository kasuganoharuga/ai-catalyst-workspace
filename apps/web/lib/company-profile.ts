import { cache } from "react";

import { getMyCompanyProfile as getMyCompanyProfileUncached } from "@ai-catalyst/services/company-profile";
import type { CompanyProfile } from "@ai-catalyst/shared";

// Thin Next.js shell over packages/services/company-profile — read path
// only, same pattern as lib/user-profile.ts. Writes go through
// updateCompanyProfileAction in lib/actions/founder-actions.ts.
export const getMyCompanyProfile = cache(getMyCompanyProfileUncached);

/**
 * The company name to show in the page heading. Uses the saved profile
 * name when present; otherwise a neutral placeholder — not the linked
 * venture's working title (e.g. "mcp-manual-test's Idea").
 */
export function resolveCompanyDisplayName(
  profile: Pick<CompanyProfile, "name"> | null,
): string {
  const name = profile?.name?.trim();
  if (name) return name;
  return "Your company";
}
