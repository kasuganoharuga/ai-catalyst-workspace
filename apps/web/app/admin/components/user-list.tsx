"use client";

import { Search } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import type { AdminUserListItem, AssignableMentor } from "@ai-catalyst/shared";

import { UserRow } from "./user-row";

type RoleFilter = "all" | "founder" | "mentor" | "admin" | "pending";
type MentorFilter = "all" | "none" | string;

const ROLE_OPTIONS: { value: RoleFilter; label: string }[] = [
  { value: "all", label: "All roles" },
  { value: "founder", label: "Founder" },
  { value: "mentor", label: "Mentor" },
  { value: "admin", label: "Admin" },
  { value: "pending", label: "Pending" },
];

const selectClassName =
  "rounded-lg border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-foreground focus:ring-2 focus:ring-ring/50";

/**
 * Search + role/mentor filters for the Admin directory — toolbar mirrors
 * FounderList; filters sit under the search row.
 */
export function UserList({
  users,
  mentors,
  currentUserId,
  children,
}: {
  users: AdminUserListItem[];
  mentors: AssignableMentor[];
  currentUserId: string;
  children?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [mentorFilter, setMentorFilter] = useState<MentorFilter>("all");

  const mentorOptions = useMemo(() => {
    // Prefer the assignable-mentor list; also include any mentor still shown
    // on a founder row so a reassignment never orphans the filter option.
    const byId = new Map<string, { id: string; label: string }>();
    for (const mentor of mentors) {
      byId.set(mentor.id, {
        id: mentor.id,
        label: mentor.name?.trim() || mentor.email,
      });
    }
    for (const user of users) {
      if (user.mentorUserId && !byId.has(user.mentorUserId)) {
        byId.set(user.mentorUserId, {
          id: user.mentorUserId,
          label:
            user.mentorName?.trim() || user.mentorEmail || user.mentorUserId,
        });
      }
    }
    return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [mentors, users]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return users.filter((user) => {
      if (roleFilter !== "all" && user.role !== roleFilter) {
        return false;
      }

      if (mentorFilter === "none") {
        // "No mentor" only applies to founders — others have no binding.
        if (user.role !== "founder" || user.mentorUserId !== null) {
          return false;
        }
      } else if (mentorFilter !== "all") {
        if (user.mentorUserId !== mentorFilter) {
          return false;
        }
      }

      if (needle === "") {
        return true;
      }

      return [
        user.email,
        user.name,
        user.role,
        user.mentorEmail,
        user.mentorName,
      ]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(needle));
    });
  }, [users, query, roleFilter, mentorFilter]);

  const filtersActive =
    roleFilter !== "all" || mentorFilter !== "all" || query.trim() !== "";

  return (
    <div className="mt-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block w-full sm:max-w-sm">
          <span className="sr-only">Search users</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by email, name, or role"
            className="w-full rounded-lg border border-border bg-card py-2.5 pl-9 pr-4 text-sm outline-none focus:border-foreground focus:ring-2 focus:ring-ring/50"
          />
        </label>
        {children ? <div className="shrink-0">{children}</div> : null}
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <label className="flex min-w-0 items-center gap-2 sm:max-w-xs">
          <span className="shrink-0 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Role
          </span>
          <select
            value={roleFilter}
            onChange={(event) =>
              setRoleFilter(event.target.value as RoleFilter)
            }
            className={`min-w-0 flex-1 ${selectClassName}`}
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-0 items-center gap-2 sm:max-w-sm">
          <span className="shrink-0 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Mentor
          </span>
          <select
            value={mentorFilter}
            onChange={(event) => setMentorFilter(event.target.value)}
            className={`min-w-0 flex-1 ${selectClassName}`}
          >
            <option value="all">All mentors</option>
            <option value="none">No mentor</option>
            {mentorOptions.map((mentor) => (
              <option key={mentor.id} value={mentor.id}>
                {mentor.label}
              </option>
            ))}
          </select>
        </label>

        {filtersActive ? (
          <p className="font-mono text-[11px] tabular-nums text-muted-foreground sm:ml-auto">
            {filtered.length} of {users.length}
          </p>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <div className="mt-6 rounded-xl border border-border bg-card px-6 py-14 text-center">
          <p className="text-[15px] font-semibold text-foreground">
            No matching users
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Try a different search or clear the role / mentor filters.
          </p>
        </div>
      ) : (
        <div className="mt-8">
          <div className="hidden items-center gap-6 border-b border-border pb-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground sm:flex">
            <span className="min-w-0 flex-1">User</span>
            <span className="w-28">Role</span>
            <span className="w-56">Mentor</span>
            <span className="w-56" aria-hidden="true" />
          </div>

          <div className="flex flex-col">
            {filtered.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                mentors={mentors}
                isSelf={user.id === currentUserId}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
