import type { ModuleAttemptStatus } from "@ai-catalyst/shared";

// Listed under "./attempt/internal/retry" in package.json only so
// Turbopack can resolve this module's cross-file imports (see
// internal/slug.ts for why) — not part of the intended public API.
//
// Named export so Pivot/retry logic can extend this set without inlining.
// Pivot moves the prior Attempt to 'cancelled' (not 'rejected') so Founders
// can start a retry via startOrResumeAttempt.
export const RETRYABLE_ATTEMPT_STATUSES = ["validation_failed", "rejected", "cancelled"] as const;

export type RetryableAttemptStatus = (typeof RETRYABLE_ATTEMPT_STATUSES)[number];

export function isRetryableAttemptStatus(
  status: ModuleAttemptStatus,
): status is RetryableAttemptStatus {
  return (RETRYABLE_ATTEMPT_STATUSES as readonly ModuleAttemptStatus[]).includes(status);
}
