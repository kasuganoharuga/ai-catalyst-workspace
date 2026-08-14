import type { ModuleGridItem } from "../types";
import { ModuleStatusCard } from "./module-status-card";

export type { ModuleGridItem };

/** Prefer in-progress, else next available, else first incomplete. */
export function focusModuleIndex(items: ModuleGridItem[]): number {
  const statuses = items.map((item) => item.context?.runModule.status ?? null);

  const inProgress = statuses.findIndex((status) => status === "in_progress");
  if (inProgress >= 0) return inProgress;

  const available = statuses.findIndex((status) => status === "available");
  if (available >= 0) return available;

  const readyToUnlock = statuses.findIndex(
    (status) => status === "ready_to_unlock",
  );
  if (readyToUnlock >= 0) return readyToUnlock;

  const firstIncomplete = statuses.findIndex(
    (status) => status !== "completed",
  );
  return firstIncomplete >= 0 ? firstIncomplete : 0;
}

// Preview only, not the full list — "View all" links to /modules for that.
// Card count steps up with width instead of shrinking the cards to fit more
// in: one on phones, two from sm, four from md (two rows of the same
// two-column grid either way).
const MAX_VISIBLE = 4;

// Index -> the class that hides it below its reveal breakpoint. Index 0 has
// no entry: the current Module is always visible.
const REVEAL_AT: Record<number, string> = {
  1: "hidden sm:block",
  2: "hidden md:block",
  3: "hidden md:block",
};

/**
 * A forward-looking slice starting at the current / next Module — completed
 * Modules behind it don't take up space here. Same card size as the
 * /modules page's own grid (two per row) so a Module reads the same size
 * wherever it shows up.
 */
export function ModulesGrid({ items }: { items: ModuleGridItem[] }) {
  if (items.length === 0) return null;
  const focusIndex = focusModuleIndex(items);
  const visible = items.slice(focusIndex, focusIndex + MAX_VISIBLE);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {visible.map((item, index) => (
        <div key={item.catalog.moduleKey} className={REVEAL_AT[index]}>
          <ModuleStatusCard
            catalog={item.catalog}
            context={item.context}
            isFocus={index === 0}
          />
        </div>
      ))}
    </div>
  );
}
