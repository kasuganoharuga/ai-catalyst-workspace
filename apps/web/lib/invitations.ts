import { cache } from "react";

import {
  listFounderInvitations as listFounderInvitationsUncached,
  listMentorInvitations as listMentorInvitationsUncached,
} from "@ai-catalyst/services/invitation";

// Thin Next.js shell: React cache() on invitation read paths only (mutations go through server actions).
// listFounderInvitations is Admin-or-own-Mentor scoped; listMentorInvitations is Admin-only.
export const listFounderInvitations = cache(listFounderInvitationsUncached);
export const listMentorInvitations = cache(listMentorInvitationsUncached);
