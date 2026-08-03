import type { StatusTone } from "./module-display";

export interface FounderDisplayStatus {
  label: string;
  tone: StatusTone;
}

/**
 * Maps a Founder's aggregate module progress (as seen by their Mentor) to a
 * status pill, using the same tone vocabulary as deriveModuleDisplayStatus
 * (see components/status-badge.tsx): muted for nothing to see yet, outline
 * for ready-but-untouched, lime for "this is worth a look", ink for
 * settled/finished.
 *
 * There is no per-Founder accent colour the way a Module has one, so "all
 * modules done" borrows ink rather than the "module" tone — that tone needs
 * a sequence index this has no equivalent of.
 */
export function deriveFounderStatus(
  totalModules: number | null,
  completedModules: number | null,
): FounderDisplayStatus {
  if (totalModules === null) {
    return { label: "Not started", tone: "muted" };
  }
  const completed = completedModules ?? 0;
  if (completed === 0) {
    return { label: "Just started", tone: "outline" };
  }
  if (completed >= totalModules) {
    return { label: "All modules done", tone: "ink" };
  }
  return { label: "In progress", tone: "lime" };
}
