import { describe, expect, it } from "vitest";

import type { MentorFounderSummary } from "@ai-catalyst/shared";

import { buildMentorDashboardView } from "@/app/(app)/dashboard/lib/mentor-dashboard-state";

function founder(
  overrides: Partial<MentorFounderSummary> & { workspaceId: string },
): MentorFounderSummary {
  return {
    workspaceName: "Workspace",
    workspaceStatus: "active",
    founderUserId: overrides.workspaceId,
    founderName: "Ada Lovelace",
    founderEmail: "ada@example.com",
    totalModules: null,
    completedModules: null,
    lastCompletedAt: null,
    ...overrides,
  };
}

describe("buildMentorDashboardView", () => {
  const now = Date.parse("2026-08-11T00:00:00.000Z");

  it("handles an empty founder list", () => {
    const view = buildMentorDashboardView({ founders: [], now });
    expect(view.founderCount).toBe(0);
    expect(view.averageProgressPct).toBeNull();
    expect(view.recentActivity).toEqual([]);
  });

  it("computes progress mix, average %, and recent activity", () => {
    const view = buildMentorDashboardView({
      founders: [
        founder({
          workspaceId: "a",
          founderName: "Not Started",
          totalModules: null,
        }),
        founder({
          workspaceId: "b",
          founderName: "Just Started",
          totalModules: 4,
          completedModules: 0,
        }),
        founder({
          workspaceId: "c",
          founderName: "In Progress",
          totalModules: 4,
          completedModules: 2,
          lastCompletedAt: "2026-08-10T12:00:00.000Z",
        }),
        founder({
          workspaceId: "d",
          founderName: "Done",
          totalModules: 4,
          completedModules: 4,
          lastCompletedAt: "2026-07-01T12:00:00.000Z",
        }),
      ],
      now,
    });

    expect(view.founderCount).toBe(4);
    expect(view.progress).toEqual({
      notStarted: 1,
      justStarted: 1,
      inProgress: 1,
      complete: 1,
    });
    // (0 + 50 + 100) / 3 among started
    expect(view.averageProgressPct).toBe(50);
    expect(view.activeThisWeek).toBe(1);
    expect(view.recentActivity[0]?.name).toBe("In Progress");
  });
});
