import type { AdminUserListItem, AssignableMentor } from "@ai-catalyst/shared";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";

import { AssignMentorControl } from "./assign-mentor-control";
import { RoleBadge } from "./role-badge";
import { SoftDeleteUserButton } from "./soft-delete-user-button";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * One user row on the Admin directory — column widths must stay in step with
 * the header row in page.tsx (same pattern as FounderRow / founder-list).
 */
export function UserRow({
  user,
  mentors,
  isSelf,
}: {
  user: AdminUserListItem;
  mentors: AssignableMentor[];
  isSelf: boolean;
}) {
  const showMentorControls =
    user.role === "founder" && user.workspaceId !== null;
  const displayName = user.name?.trim() || user.email;

  return (
    <div className="flex flex-col gap-3 border-b border-border py-4 transition last:border-b-0 hover:bg-muted/40 sm:flex-row sm:items-center sm:gap-6">
      <div className="flex min-w-0 items-center gap-3 sm:flex-1">
        <Avatar className="h-8 w-8 shrink-0 rounded-md">
          <AvatarFallback className="rounded-md bg-surface-inverse font-mono text-[11px] font-semibold text-brand-lime">
            {initials(displayName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold tracking-tight text-foreground">
            {user.email}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {displayName}
            {isSelf ? " · you" : ""}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 sm:contents">
        <div className="flex sm:w-28 sm:justify-start">
          <RoleBadge role={user.role} />
        </div>

        <div className="min-w-0 flex-1 sm:w-56 sm:flex-none">
          {showMentorControls ? (
            <AssignMentorControl
              workspaceId={user.workspaceId!}
              currentMentorUserId={user.mentorUserId}
              mentors={mentors}
              founderEmail={user.email}
            />
          ) : (
            <p className="text-xs text-muted-foreground sm:text-right">
              {user.mentorEmail ?? "—"}
            </p>
          )}
        </div>
      </div>

      <div className="flex sm:w-24 sm:justify-end">
        {isSelf ? null : (
          <SoftDeleteUserButton userId={user.id} email={user.email} />
        )}
      </div>
    </div>
  );
}
