import type { MentorFounderSummary } from "@ai-catalyst/shared";

import { deriveFounderStatus } from "../../lib/founder-status";

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_WINDOW_MS = 7 * DAY_MS;

export type MentorProgressBucket =
  "notStarted" | "justStarted" | "inProgress" | "complete";

export type MentorRecentActivityItem = {
  workspaceId: string;
  name: string;
  lastCompletedAt: string;
  progressLabel: string;
};

export type MentorDashboardView = {
  founderCount: number;
  averageProgressPct: number | null;
  activeThisWeek: number;
  progress: Record<MentorProgressBucket, number>;
  recentActivity: MentorRecentActivityItem[];
};

function displayName(founder: MentorFounderSummary): string {
  return founder.founderName ?? founder.founderEmail;
}

function progressBucket(founder: MentorFounderSummary): MentorProgressBucket {
  const status = deriveFounderStatus(
    founder.totalModules,
    founder.completedModules,
  );
  switch (status.label) {
    case "Not started":
      return "notStarted";
    case "Just started":
      return "justStarted";
    case "Complete":
      return "complete";
    default:
      return "inProgress";
  }
}

function isWithin(iso: string | null, windowMs: number, now: number): boolean {
  if (!iso) return false;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return false;
  return now - at <= windowMs;
}

export function buildMentorDashboardView(input: {
  founders: MentorFounderSummary[];
  now?: number;
}): MentorDashboardView {
  const now = input.now ?? Date.now();
  const { founders } = input;

  const progress: Record<MentorProgressBucket, number> = {
    notStarted: 0,
    justStarted: 0,
    inProgress: 0,
    complete: 0,
  };
  for (const founder of founders) {
    progress[progressBucket(founder)] += 1;
  }

  const started = founders.filter((founder) => founder.totalModules !== null);
  let averageProgressPct: number | null = null;
  if (started.length > 0) {
    const sum = started.reduce((acc, founder) => {
      const total = founder.totalModules ?? 0;
      if (total <= 0) return acc;
      return acc + ((founder.completedModules ?? 0) / total) * 100;
    }, 0);
    averageProgressPct = Math.round(sum / started.length);
  }

  const activeThisWeek = founders.filter((founder) =>
    isWithin(founder.lastCompletedAt, ACTIVE_WINDOW_MS, now),
  ).length;

  const recentActivity = [...founders]
    .filter((founder) => founder.lastCompletedAt !== null)
    .sort(
      (a, b) => Date.parse(b.lastCompletedAt!) - Date.parse(a.lastCompletedAt!),
    )
    .slice(0, 5)
    .map((founder) => ({
      workspaceId: founder.workspaceId,
      name: displayName(founder),
      lastCompletedAt: founder.lastCompletedAt!,
      progressLabel:
        founder.totalModules === null
          ? "—"
          : `${founder.completedModules ?? 0}/${founder.totalModules}`,
    }));

  return {
    founderCount: founders.length,
    averageProgressPct,
    activeThisWeek,
    progress,
    recentActivity,
  };
}
