import Link from "next/link";

import type { MentorRecentActivityItem } from "../lib/mentor-dashboard-state";
import { mentorDashboardCopy } from "../../lib/copy";

function formatActivityDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}

export function MentorRecentActivity({
  items,
}: {
  items: MentorRecentActivityItem[];
}) {
  return (
    <section className="mt-14">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-serif text-2xl font-medium tracking-[-0.01em]">
          {mentorDashboardCopy.recentHeading}
        </h2>
        <Link
          href="/founders"
          className="text-sm font-medium text-muted-foreground transition hover:text-foreground"
        >
          {mentorDashboardCopy.recentViewAll}
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="mt-5 text-[15px] leading-7 text-muted-foreground">
          {mentorDashboardCopy.recentEmpty}
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-border border-y border-border">
          {items.map((item) => (
            <li key={item.workspaceId}>
              <Link
                href={`/founders/${encodeURIComponent(item.workspaceId)}`}
                className="flex items-center justify-between gap-4 py-4 transition hover:bg-muted/40"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold tracking-tight">
                    {item.name}
                  </span>
                  <span className="mt-0.5 block font-mono text-[11px] tabular-nums text-muted-foreground">
                    {mentorDashboardCopy.recentLine(
                      item.progressLabel,
                      formatActivityDate(item.lastCompletedAt),
                    )}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
