"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const POLL_MS = 10_000;

/**
 * Light refresh while an Artifact comment panel is open, so a reply from
 * the other side shows up without a manual reload. Same shape as
 * use-soft-module-refresh.ts (kept as its own file rather than reused
 * directly, so each call site's name and doc comment describe what it is
 * actually waiting on) — pauses when hidden, never overlaps in-flight
 * refreshes, cleans up on unmount.
 */
export function useCommentRefresh(shouldPoll: boolean) {
  const router = useRouter();
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!shouldPoll) return;

    function refresh() {
      if (inFlightRef.current) return;
      if (typeof document !== "undefined" && document.hidden) return;
      inFlightRef.current = true;
      try {
        router.refresh();
      } finally {
        // refresh() is sync kickoff; give the next tick before allowing another.
        window.setTimeout(() => {
          inFlightRef.current = false;
        }, 500);
      }
    }

    function onVisibility() {
      if (!document.hidden) refresh();
    }

    const id = window.setInterval(refresh, POLL_MS);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [shouldPoll, router]);
}
