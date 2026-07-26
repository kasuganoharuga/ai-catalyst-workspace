"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { ensureActiveProgramDestinationAction } from "@/lib/actions/founder-actions";

import { errorCopy } from "../../lib/copy";
import type { ConnectionWatchState } from "../types";

// Long enough not to hammer the action while someone reads Claude's
// screens, short enough that coming back to this tab feels immediate. The
// visibility listener is what actually makes it feel instant — this
// interval only matters for the founder who left the page open on a second
// monitor.
const POLL_MS = 5_000;

/**
 * Watches for the connector approval to land, then hands back the
 * destination so the page can move on.
 *
 * Polling pauses while the tab is hidden and fires immediately when it
 * becomes visible again, which is the exact moment a founder returns from
 * Claude in another tab. For the desktop app the tab often stays
 * "visible", so the interval covers that case.
 */
export function useConnectionWatch() {
  const router = useRouter();
  const [state, setState] = useState<ConnectionWatchState>({
    phase: "waiting",
  });
  // Refs rather than state: these must not restart the interval, and
  // `inFlight` has to stop a slow response overlapping the next tick.
  const inFlight = useRef(false);
  const stopped = useRef(false);

  const check = useCallback(async () => {
    if (inFlight.current || stopped.current) return;
    inFlight.current = true;
    try {
      const result = await ensureActiveProgramDestinationAction();
      if (stopped.current) return;

      switch (result.status) {
        case "ready":
          stopped.current = true;
          setState({ phase: "advancing" });
          router.push(result.destination);
          router.refresh();
          return;
        case "not_connected":
          // The expected answer for most ticks — keep waiting quietly.
          return;
        case "setup_failed":
          stopped.current = true;
          setState({ phase: "failed", message: errorCopy.setupFailed });
          return;
        case "no_active_venture":
          stopped.current = true;
          setState({ phase: "failed", message: errorCopy.noActiveVenture });
          return;
        case "venture_unavailable":
          stopped.current = true;
          setState({ phase: "failed", message: errorCopy.ventureUnavailable });
          return;
        case "error":
          stopped.current = true;
          setState({
            phase: "failed",
            message: result.message ?? errorCopy.generic,
          });
          return;
      }
    } catch {
      // A dropped request mid-poll is not worth reporting — the next tick
      // covers it. Only a definite answer from the action stops the watch.
    } finally {
      inFlight.current = false;
    }
  }, [router]);

  useEffect(() => {
    if (state.phase !== "waiting") return;

    const interval = setInterval(() => {
      if (document.hidden) return;
      void check();
    }, POLL_MS);

    function onVisible() {
      if (!document.hidden) void check();
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [check, state.phase]);

  const retry = useCallback(() => {
    stopped.current = false;
    setState({ phase: "waiting" });
    void check();
  }, [check]);

  return { state, retry };
}
