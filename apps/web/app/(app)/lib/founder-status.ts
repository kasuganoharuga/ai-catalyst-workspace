import type { StatusTone } from "./module-display";

export interface FounderDisplayStatus {
  label: string;
  tone: StatusTone;
}

/**
 * Mentor-facing aggregate progress pill — same tone vocabulary as deriveModuleDisplayStatus.
 * Complete uses ink, not "module" tone (no per-Founder accent index).
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
    // "Complete", not "All modules done": the list renders this in a column
    // headed STATUS with the module count sitting right beside it, so the
    // longer phrase only made the column wide enough to squeeze the name.
    return { label: "Complete", tone: "ink" };
  }
  return { label: "In progress", tone: "lime" };
}
