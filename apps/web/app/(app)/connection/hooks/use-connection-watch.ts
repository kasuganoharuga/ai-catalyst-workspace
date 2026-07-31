"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { ensureActiveProgramDestinationAction } from "@/lib/actions/founder-actions";

import { errorCopy } from "../../lib/copy";
import type { ConnectionWatchState } from "../types";

// Steady poll while the tab is visible. Returning from Claude also triggers
// an immediate check (plus a short burst) — OAuth token rows can land a
// moment after the browser tab becomes visible again.
const POLL_MS = 5_000;
const RETURN_RETRY_MS = [0, 1_000, 2_500] as const;

/** Polls for connector approval, then navigates to the program destination. */
export function useConnectionWatch() {
  const router = useRouter();
  const [state, setState] = useState<ConnectionWatchState>({
    phase: "waiting",
  });
  // Refs avoid restarting the interval; inFlight prevents overlapping ticks.
  const inFlight = useRef(false);
  const stopped = useRef(false);
  const returnTimers = useRef<number[]>([]);

  const clearReturnTimers = useCallback(() => {
    for (const id of returnTimers.current) {
      window.clearTimeout(id);
    }
    returnTimers.current = [];
  }, []);

  const check = useCallback(async () => {
    if (inFlight.current || stopped.current) return;
    inFlight.current = true;
    try {
      const result = await ensureActiveProgramDestinationAction();
      if (stopped.current) return;

      switch (result.status) {
        case "ready":
          stopped.current = true;
          clearReturnTimers();
          setState({ phase: "advancing" });
          // Refresh first so /connection can flip to the authorised view if
          // navigation is slow; then leave for the next module.
          router.refresh();
          router.push(result.destination);
          return;
        case "not_connected":
          // Expected for most ticks.
          return;
        case "setup_failed":
          stopped.current = true;
          clearReturnTimers();
          setState({ phase: "failed", message: errorCopy.setupFailed });
          return;
        case "no_active_venture":
          stopped.current = true;
          clearReturnTimers();
          setState({ phase: "failed", message: errorCopy.noActiveVenture });
          return;
        case "venture_unavailable":
          stopped.current = true;
          clearReturnTimers();
          setState({ phase: "failed", message: errorCopy.ventureUnavailable });
          return;
        case "error":
          stopped.current = true;
          clearReturnTimers();
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
  }, [clearReturnTimers, router]);

  const checkSoon = useCallback(() => {
    if (stopped.current || document.hidden) return;
    clearReturnTimers();
    for (const delay of RETURN_RETRY_MS) {
      const id = window.setTimeout(() => {
        void check();
      }, delay);
      returnTimers.current.push(id);
    }
  }, [check, clearReturnTimers]);

  useEffect(() => {
    if (state.phase !== "waiting") return;

    // Mount / retry: do not wait a full poll interval to notice an already
    // completed OAuth (or a token that landed while this tab was hidden).
    checkSoon();

    const interval = window.setInterval(() => {
      if (document.hidden) return;
      void check();
    }, POLL_MS);

    function onVisible() {
      if (!document.hidden) checkSoon();
    }

    // Claude Desktop / system-browser OAuth often returns focus without a
    // reliable visibilitychange; pageshow covers bfcache restores.
    function onFocus() {
      checkSoon();
    }
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted || !document.hidden) checkSoon();
    }

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      window.clearInterval(interval);
      clearReturnTimers();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [check, checkSoon, clearReturnTimers, state.phase]);

  const retry = useCallback(() => {
    stopped.current = false;
    setState({ phase: "waiting" });
  }, []);

  return { state, retry };
}
