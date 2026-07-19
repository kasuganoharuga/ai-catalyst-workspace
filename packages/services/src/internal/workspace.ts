import type { WorkspaceStatus } from "@ai-catalyst/shared";

import { ServiceError } from "@ai-catalyst/services/errors";

// Listed under "./internal/workspace" in package.json only so Turbopack can
// resolve this module's cross-file imports (see internal/slug.ts for why) —
// not part of the intended public API. Write paths (Venture create/archive)
// call this, but apps/web/apps/mcp never should; they only ever see the
// FORBIDDEN ServiceError this throws, surfaced through the normal Service
// call they're already making.
export function assertWorkspaceActive(status: WorkspaceStatus): void {
  if (status !== "active") {
    throw new ServiceError("FORBIDDEN", "Workspace is not active.");
  }
}
