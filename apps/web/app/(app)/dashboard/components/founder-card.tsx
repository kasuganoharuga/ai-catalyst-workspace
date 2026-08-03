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
 * One Founder's card on the Mentor dashboard — same shape as the Founder
 * dashboard's own module cards (dashboard/components/module-status-card.tsx):
 * identity row with a status pill, a three-row definition list, rounded-xl
 * card with a hover border. Kept as a visual sibling deliberately, not a
 * shared component — the two show unrelated things (a Module's own state
 * vs. a Founder's aggregate progress) and would only fight over an API if
 * merged.
 */
export function FounderCard({ founder }: { founder: MentorFounderSummary }) {
  const displayName = founder.founderName ?? founder.founderEmail;
  const status = deriveFounderStatus(
    founder.totalModules,
    founder.completedModules,
  );

  return (
    <Link
      href={`/founders/${founder.workspaceId}`}
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card transition hover:border-foreground/30"
    >
      <div className="p-5">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="h-8 w-8 shrink-0 rounded-md">
              <AvatarFallback className="rounded-md bg-surface-inverse font-mono text-[11px] font-semibold text-brand-lime">
                {initials(displayName)}
              </AvatarFallback>
            </Avatar>
            <p className="truncate text-[15px] font-semibold tracking-tight text-foreground">
              {displayName}
            </p>
          </div>
          <StatusBadge status={status} />
        </div>

        <dl className="mt-4 space-y-0 text-[13px]">
          <div className="flex items-center justify-between gap-4 border-t border-border/70 py-2.5">
            <dt className="text-muted-foreground">Workspace</dt>
            <dd className="truncate text-right font-medium text-foreground">
              {founder.workspaceName}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-border/70 py-2.5">
            <dt className="text-muted-foreground">Modules</dt>
            <dd className="text-right">
              {founder.totalModules === null ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <span className="font-mono text-xs tabular-nums text-foreground">
                  {founder.completedModules ?? 0} / {founder.totalModules}
                </span>
              )}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-border/70 py-2.5">
            <dt className="text-muted-foreground">Last completed</dt>
            <dd className="text-right">
              {founder.lastCompletedAt ? (
                <span className="font-mono text-xs tabular-nums text-foreground">
                  {formatDate(founder.lastCompletedAt)}
                </span>
              ) : (
                <span className="text-muted-foreground">Not yet</span>
              )}
            </dd>
          </div>
        </dl>
      </div>
    </Link>
  );
}
