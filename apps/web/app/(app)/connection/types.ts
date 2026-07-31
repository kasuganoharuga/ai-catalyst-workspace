/**
 * Watcher phase while waiting for connector approval.
 * `waiting` — still polling; `failed` — polling stopped until retry.
 */
export type ConnectionWatchState =
  | { phase: "waiting" }
  | { phase: "advancing" }
  | { phase: "failed"; message: string };
