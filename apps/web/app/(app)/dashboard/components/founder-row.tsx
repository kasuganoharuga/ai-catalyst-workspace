import { ChevronRight } from "lucide-react";
import Link from "next/link";

import type { MentorFounderSummary } from "@ai-catalyst/shared";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";

import { StatusBadge } from "../../components/status-badge";
import { deriveFounderStatus } from "../../lib/founder-status";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}

/**
 * One Founder's row on the Mentor "My founders" list.
 *
 * Column widths here are load-bearing: they are repeated on the header row
 * in founder-list.tsx, and the two must stay in step or the labels stop
 * sitting above the values they name. Anything changed below needs the same
 * change there.
 */
export function FounderRow({ founder }: { founder: MentorFounderSummary }) {
  const displayName = founder.founderName ?? founder.founderEmail;
  const status = deriveFounderStatus(
    founder.totalModules,
    founder.completedModules,
  );

  return (
    <Link
      href={`/founders/${founder.workspaceId}`}
      className="group flex flex-col gap-3 border-b border-border py-4 transition last:border-b-0 hover:bg-muted/40 sm:flex-row sm:items-center sm:gap-6"
    >
      <div className="flex min-w-0 items-center gap-3 sm:flex-1">
        <Avatar className="h-8 w-8 shrink-0 rounded-md">
          <AvatarFallback className="rounded-md bg-surface-inverse font-mono text-[11px] font-semibold text-brand-lime">
            {initials(displayName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold tracking-tight text-foreground">
            {displayName}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {founder.founderEmail} · {founder.workspaceName}
          </p>
        </div>
      </div>

      {/* On a narrow screen these three share one line under the name. At sm+
          the wrapper becomes `display: contents`, so each child is promoted
          to a direct flex item of the row and lines up with its header. */}
      <div className="flex items-center gap-4 sm:contents">
        <div className="flex flex-1 items-center gap-3 sm:w-40 sm:flex-none">
          <ProgressBar
            completed={founder.completedModules}
            total={founder.totalModules}
          />
          <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-foreground">
            {founder.totalModules === null
              ? "—"
              : `${founder.completedModules ?? 0}/${founder.totalModules}`}
          </span>
        </div>

        {/* Hidden below sm: without the column header to name it, a bare
            date sitting next to the module count is ambiguous, and for a
            Founder with neither the row degrades to "— —". The detail page
            still carries it. */}
        <span className="hidden shrink-0 font-mono text-xs tabular-nums text-muted-foreground sm:block sm:w-28 sm:text-right">
          {founder.lastCompletedAt ? formatDate(founder.lastCompletedAt) : "—"}
        </span>

        <div className="flex shrink-0 sm:w-32 sm:justify-end">
          <StatusBadge status={status} />
        </div>
      </div>

      <ChevronRight
        aria-hidden="true"
        className="hidden h-4 w-4 shrink-0 text-muted-foreground/40 transition group-hover:text-foreground sm:block"
      />
    </Link>
  );
}

function ProgressBar({
  completed,
  total,
}: {
  completed: number | null;
  total: number | null;
}) {
  const pct =
    total && total > 0 ? Math.round(((completed ?? 0) / total) * 100) : 0;

  // aria-hidden: the "2/6" beside it already says this, and a second
  // announcement of the same number is noise rather than help.
  return (
    <span
      aria-hidden="true"
      className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
    >
      <span
        className="block h-full rounded-full bg-primary"
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}
