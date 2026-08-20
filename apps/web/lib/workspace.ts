import { cache } from "react";

import { getMyWorkspace as getMyWorkspaceUncached } from "@ai-catalyst/services/workspace";

// Thin Next.js shell over packages/services/workspace: adds React's
// request-scoped cache() the same way lib/invitations.ts does — no
// business logic lives here.
export const getMyWorkspace = cache(getMyWorkspaceUncached);
