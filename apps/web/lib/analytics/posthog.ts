import posthog from "posthog-js";

import {
  resolveBrowserAppEnv,
  resolveBrowserRelease,
} from "@ai-catalyst/observability/env";

// --- PostHog browser init ---
//
// Same shape as instrumentation-client.ts's Sentry setup: read the
// NEXT_PUBLIC_* key as a literal member access (Next.js only substitutes the
// exact source text `process.env.NEXT_PUBLIC_POSTHOG_KEY` at `next build` —
// see packages/observability/src/env.ts's long comment on why
// resolveBrowserAppEnv/resolveBrowserRelease exist as separate functions for
// the same reason), and no-op entirely when the key is empty so local/CI
// builds never need a real project configured.
const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
const host =
  process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com";

let initialized = false;

export function initPostHog(): void {
  if (initialized || !key) return;
  initialized = true;

  posthog.init(key, {
    api_host: host,
    // "history_change" captures the initial load and every client-side
    // route change the App Router makes via the History API — Next.js never
    // does a full page load between routes, so the plain default (load-only)
    // would only ever see the first page.
    capture_pageview: "history_change",
    person_profiles: "identified_only",
    // Founder Artefact bodies are their unpublished commercial content —
    // session replay would ship it to a third party by default. Never turn
    // this on without a separate, explicit decision to do so.
    disable_session_recording: true,
    loaded: (client) => {
      client.register({
        app_env: resolveBrowserAppEnv(),
        release: resolveBrowserRelease(),
      });
    },
  });
}

export { posthog };
