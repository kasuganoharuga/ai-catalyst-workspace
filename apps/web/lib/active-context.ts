import { cache } from "react";

import { getActiveContext as getActiveContextUncached } from "@ai-catalyst/services/workspace/active-context";

// Thin Next.js shell over packages/services/workspace/active-context —
// read path only; switching/clearing is a mutation and goes through the
// PATCH /api/active-context route handler.
export const getActiveContext = cache(getActiveContextUncached);
