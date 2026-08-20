"use client";

import { useEffect } from "react";

import { posthog } from "@/lib/analytics/posthog";
import type { AnalyticsEventName } from "@/lib/analytics/events";

/**
 * Fires one PostHog capture() on mount. Renders nothing — drop it into an
 * RSC page to record "this view happened" without turning the page itself
 * into a Client Component. Not for anything that needs to fire more than
 * once per mount (a click, a form submit): call posthog.capture directly
 * from that component's own handler instead.
 *
 * `propertiesJson` takes a pre-serialized string rather than an object:
 * every caller here is an RSC page passing a fresh object literal each
 * render, and JSON is a stable primitive to key the effect's dependency
 * array on instead — an inline object would give the effect a new identity
 * every render and either re-fire (if depended on) or need a ref mutated
 * during render, which this repo's react-hooks/refs lint rule disallows.
 */
export function AnalyticsTrack({
  event,
  propertiesJson,
}: {
  event: AnalyticsEventName;
  propertiesJson?: string;
}) {
  useEffect(() => {
    posthog.capture(
      event,
      propertiesJson ? JSON.parse(propertiesJson) : undefined,
    );
  }, [event, propertiesJson]);

  return null;
}
