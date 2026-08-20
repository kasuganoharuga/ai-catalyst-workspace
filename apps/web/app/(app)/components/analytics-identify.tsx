"use client";

import { useEffect } from "react";

import { posthog } from "@/lib/analytics/posthog";

/**
 * Links the current request's userId to PostHog's anonymous distinct_id, so
 * events from the same person link up across sessions/devices. Renders
 * nothing — mounted once in the (app) shell layout, which already resolves
 * the actor server-side for every Founder/Mentor page.
 *
 * Deliberately identifies by userId + role only, never email or name:
 * packages/observability/src/sentry-init.ts sets sendDefaultPii: false for
 * the same reason, and there's no cause for the analytics tool to be looser
 * about PII than the error tracker.
 */
export function AnalyticsIdentify({
  userId,
  role,
}: {
  userId: string;
  role: "founder" | "mentor";
}) {
  useEffect(() => {
    posthog.identify(userId, { role });
  }, [userId, role]);

  return null;
}
