"use client";

import { Search } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import type { MentorFounderSummary } from "@ai-catalyst/shared";

import { mentorOverviewCopy } from "../../lib/copy";
import { FounderRow } from "./founder-row";

function displayName(founder: MentorFounderSummary): string {
  return founder.founderName ?? founder.founderEmail;
}

/**
 * Owns the search box and the resulting filtered/sorted view of the
 * Mentor's Founders — the one interactive piece of an otherwise
 * server-rendered page, same split as ../modules-carousel.tsx.
 *
 * Sorted here by display name rather than the service's own
 * `order by w.name` (workspace name): the row's primary visual is the
 * Founder's name, so ordering by anything else reads as random.
 *
 * `children` is the "Invite a founder" button, handed down from the server
 * component so it can share this toolbar row with the search field rather
 * than needing a line of its own above it.
 */
export function FounderList({
  founders,
  children,
}: {
  founders: MentorFounderSummary[];
  children?: ReactNode;
}) {
  const [query, setQuery] = useState("");

  const sorted = useMemo(
    () =>
      [...founders].sort((a, b) =>
        displayName(a).localeCompare(displayName(b)),
      ),
    [founders],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === "") return sorted;
    return sorted.filter((founder) =>
      [founder.founderName, founder.founderEmail, founder.workspaceName]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(needle)),
    );
  }, [sorted, query]);

  return (
    <div className="mt-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block w-full sm:max-w-sm">
          <span className="sr-only">{mentorOverviewCopy.searchLabel}</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={mentorOverviewCopy.searchPlaceholder}
            className="w-full rounded-lg border border-border bg-card py-2.5 pl-9 pr-4 text-sm outline-none focus:border-foreground focus:ring-2 focus:ring-ring/50"
          />
        </label>
        {children ? <div className="shrink-0">{children}</div> : null}
      </div>

      {filtered.length === 0 ? (
        <div className="mt-6 rounded-xl border border-border bg-card px-6 py-14 text-center">
          <p className="text-[15px] font-semibold text-foreground">
            {mentorOverviewCopy.noMatchesTitle}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {mentorOverviewCopy.noMatchesBody}
          </p>
        </div>
      ) : (
        <div className="mt-8">
          {/* Column widths mirror FounderRow's — see the note there. Hidden
              below sm, where the rows stack and have nothing to align to. */}
          <div className="hidden items-center gap-6 border-b border-border pb-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground sm:flex">
            <span className="min-w-0 flex-1">
              {mentorOverviewCopy.columnFounder}
            </span>
            <span className="w-40">{mentorOverviewCopy.columnProgress}</span>
            <span className="w-28 text-right">
              {mentorOverviewCopy.columnActivity}
            </span>
            <span className="w-32 text-right">
              {mentorOverviewCopy.columnStatus}
            </span>
            <span className="w-4" aria-hidden="true" />
          </div>

          <div className="flex flex-col">
            {filtered.map((founder) => (
              <FounderRow key={founder.workspaceId} founder={founder} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
