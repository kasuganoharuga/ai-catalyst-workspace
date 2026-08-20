// --- PostHog event names ---
//
// Centralised so call sites never write a bare string literal — a typo in an
// event name silently fragments a funnel with no error anywhere. Keep this
// list short: only add an event once there's a concrete question it answers.
//
// This pass wires events a client component can fire directly on
// render/mount or from an existing success callback. Module start and
// invitation send/accept are still unwired: they're server actions inside
// existing multi-step flows (module wizard, invitation forms), and finding
// the right success callback in each without disturbing founder-facing
// state machines is real follow-up work, not a one-line addition. Add them
// here once that's done rather than declaring them dead ahead of time.

export const ANALYTICS_EVENTS = {
  /** Any saved deliverable's read-only document view was opened. */
  artefactViewed: "artefact_viewed",
  /**
   * A Mentor opened a Founder's detail page. Should carry isAssignedToMe
   * once MentorFounderSummary has that field (MENTOR_SEES_ALL_FOUNDERS,
   * packages/services/src/internal/mentor-scope.ts, on a separate branch) —
   * that turns this into usage data for how much of the widened visibility
   * actually gets used versus a Mentor's own assignments.
   */
  mentorFounderOpened: "mentor_founder_opened",
  /**
   * A Founder confirmed a Module as complete (use-confirm-module-completion.ts
   * — the single choke point behind both module0 and module1's Confirm
   * steps). Exists specifically as a PostHog Survey trigger for a
   * post-completion thumbs-up/down: the confirm action redirects to
   * `/modules`, the same URL a Founder lands on just browsing, so a
   * URL-matched survey can't tell "just completed" from "looking at the
   * list" — this event is the only reliable trigger for that moment.
   */
  moduleCompleted: "module_completed",
} as const;

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];
