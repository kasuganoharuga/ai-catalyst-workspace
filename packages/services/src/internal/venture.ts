import type { VentureStatus } from "@ai-catalyst/shared";

import { ServiceError } from "@ai-catalyst/services/errors";

// Listed under "./internal/venture" in package.json only so Turbopack can
// resolve this module's cross-file imports (see internal/slug.ts for why) —
// not part of the intended public API. Write paths that create or mutate
// state scoped to a Venture (starting a Program Run, in future creating a
// Branch/Attempt directly against it) call this; apps/web/apps/mcp never
// should — they only ever see the FORBIDDEN ServiceError this throws,
// surfaced through the normal Service call they're already making.
//
// "archived" is the only status this rejects: "paused" and "abandoned" are
// still Founder-owned, recoverable states (the Founder can still resume
// work), while "archived" is the one status Ventures never leave once set
// (see the comment on archiveVenture in venture/index.ts).
export function assertVentureWritable(status: VentureStatus): void {
  if (status === "archived") {
    throw new ServiceError(
      "FORBIDDEN",
      "This Venture is archived and can no longer be modified.",
    );
  }
}
