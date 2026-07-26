/**
 * What the connection page's watcher is doing right now.
 *
 * `waiting` is the long middle: the founder is off in Claude and every
 * poll comes back "not connected". `failed` is terminal until they retry —
 * polling stops, because something is wrong that another poll won't fix.
 */
export type ConnectionWatchState =
  | { phase: "waiting" }
  | { phase: "advancing" }
  | { phase: "failed"; message: string };
