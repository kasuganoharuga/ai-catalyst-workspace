"use client";

import { useState } from "react";

export type SaveStatus = "idle" | "saving" | "saved";

/**
 * The idle/saving/saved state machine shared by every inline-save form.
 * What triggers "saved" to actually render a note — dirty-check, a
 * caller-supplied message, or nothing at all — differs per site, so that
 * stays with each form; this only owns the three states.
 */
export function useSaveStatus() {
  const [status, setStatus] = useState<SaveStatus>("idle");
  return {
    status,
    setIdle: () => setStatus("idle"),
    setSaving: () => setStatus("saving"),
    setSaved: () => setStatus("saved"),
  };
}
