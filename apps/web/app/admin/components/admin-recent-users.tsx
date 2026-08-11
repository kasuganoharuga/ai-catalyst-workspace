import Link from "next/link";

import type { AdminRecentUser } from "@ai-catalyst/shared";

import { adminDashboardCopy } from "../lib/copy";

function formatJoinedDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}

export function AdminRecentUsers({ items }: { items: AdminRecentUser[] }) {
  return (
    <section className="mt-14">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-serif text-2xl font-medium tracking-[-0.01em]">
          {adminDashboardCopy.recentHeading}
        </h2>
        <Link
          href="/admin/users"
          className="text-sm font-medium text-muted-foreground transition hover:text-foreground"
        >
          {adminDashboardCopy.recentViewAll}
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="mt-5 text-[15px] leading-7 text-muted-foreground">
          {adminDashboardCopy.recentEmpty}
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-border border-y border-border">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href="/admin/users"
                className="flex items-center justify-between gap-4 py-4 transition hover:bg-muted/40"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold tracking-tight">
                    {item.name || item.email}
                  </span>
                  <span className="mt-0.5 block font-mono text-[11px] tabular-nums text-muted-foreground">
                    {adminDashboardCopy.recentLine(
                      adminDashboardCopy.recentRoleLabels[item.role],
                      formatJoinedDate(item.createdAt),
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
