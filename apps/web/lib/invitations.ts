import { cache } from "react";

import { listFounderInvitations as listFounderInvitationsUncached } from "@ai-catalyst/services/invitation";

// Thin Next.js shell over packages/services/invitation: adds React's
// request-scoped cache() the same way lib/toolkit.ts does — no business
// logic lives here. Only the read path is exposed this way; create/revoke
// are mutations and go through the Admin API route handlers instead.
export const listFounderInvitations = cache(listFounderInvitationsUncached);
