import type { ModuleAttemptStatus } from "@ai-catalyst/shared";

// Listed under "./attempt/internal/retry" in package.json only so
// Turbopack can resolve this module's cross-file imports (see
// internal/slug.ts for why) — not part of the intended public API.
//
// Named (not inlined into a conditional) because PR 2.8 (Pivot) may need
// to extend this set — schema comments define `retry` as "resubmission
// after a validation failure", but the iteration plan also routes Mentor
// Reject through the same based_on mechanism. Whether Pivot adds another
// status here is 2.8's own business decision; this PR only guarantees the
// mechanism stays trivially extensible.
//
// PR 2.8 decision: Pivot moves the pivoted-from Attempt to 'cancelled'
// (not 'rejected') — 'accepted'/'rejected' stay reserved exclusively for
// a real future Mentor decision (PR 4.2); a Founder choosing to pivot is
// not being reviewed/rejected by anyone. 'cancelled' is therefore also
// retryable, so completeModuleAttempt's Pivot branch can hand off to the
// public startOrResumeAttempt Retry path after cancelling.
export const RETRYABLE_ATTEMPT_STATUSES = ["validation_failed", "rejected", "cancelled"] as const;

export type RetryableAttemptStatus = (typeof RETRYABLE_ATTEMPT_STATUSES)[number];

export function isRetryableAttemptStatus(
  status: ModuleAttemptStatus,
): status is RetryableAttemptStatus {
  return (RETRYABLE_ATTEMPT_STATUSES as readonly ModuleAttemptStatus[]).includes(status);
}
