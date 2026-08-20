import type { VentureStatus } from "@ai-catalyst/shared";

import { ServiceError } from "@ai-catalyst/services/errors";

// Package subpath for Turbopack resolution only — not public API. Service write paths call this; apps never should.
// Only "archived" is rejected — paused/abandoned Ventures remain Founder-recoverable.
export function assertVentureWritable(status: VentureStatus): void {
  if (status === "archived") {
    throw new ServiceError(
      "FORBIDDEN",
      "This Venture is archived and can no longer be modified.",
    );
  }
}
