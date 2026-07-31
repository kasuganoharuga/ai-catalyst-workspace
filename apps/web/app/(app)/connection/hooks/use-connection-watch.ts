"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { ensureActiveProgramDestinationAction } from "@/lib/actions/founder-actions";

import { errorCopy } from "../../lib/copy";
import type { ConnectionWatchState } from "../types";

// Poll interval; visibility listener fires immediately when tab returns from Claude.
const POLL_MS = 5_000;

/** Polls for connector approval, then navigates to the program destination. */
export function useConnectionWatch() {
  const router = useRouter();
  const [state, setState] = useState<ConnectionWatchState>({
    phase: "waiting",
  });
  // Refs avoid restarting the interval; inFlight prevents overlapping ticks.
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
          // Expected for most ticks.
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
      // Dropped requests retry on the next tick.
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
