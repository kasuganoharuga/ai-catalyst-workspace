import { cache } from "react";

import {
  listFounderInvitations as listFounderInvitationsUncached,
  listMentorInvitations as listMentorInvitationsUncached,
} from "@ai-catalyst/services/invitation";

// Thin Next.js shell over packages/services/invitation: adds React's
// request-scoped cache() the same way lib/workspace.ts does — no business
// logic lives here. Only the read path is exposed this way; create/revoke
// are mutations, so they go through the server actions in
// lib/actions/admin-actions.ts and lib/actions/mentor-actions.ts, which
// revalidate the affected pages afterwards.
//
// Both are role-scoped inside the service: listFounderInvitations returns
// everything to an Admin but only their own to a Mentor, and
// listMentorInvitations is Admin-only.
export const listFounderInvitations = cache(listFounderInvitationsUncached);
export const listMentorInvitations = cache(listMentorInvitationsUncached);
