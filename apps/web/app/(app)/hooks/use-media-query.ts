"use client";

import { useSyncExternalStore } from "react";

function subscribe(query: string, onChange: () => void): () => void {
  const mediaQueryList = window.matchMedia(query);
  mediaQueryList.addEventListener("change", onChange);
  return () => mediaQueryList.removeEventListener("change", onChange);
}

// SSR / first paint: false so server and client agree (no matchMedia on
// the server). Client getSnapshot reads the live matchMedia result.
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onStoreChange) => subscribe(query, onStoreChange),
    () => window.matchMedia(query).matches,
    () => false,
  );
}
