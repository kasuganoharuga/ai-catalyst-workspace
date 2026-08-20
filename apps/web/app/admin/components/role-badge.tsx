import { cn } from "@/lib/utils";

const ROLE_TONE: Record<string, string> = {
  admin: "bg-surface-inverse text-surface-inverse-foreground",
  mentor: "bg-primary text-primary-foreground",
  founder: "border border-foreground/25 text-foreground",
  pending: "bg-muted text-muted-foreground",
};

/** Same pill vocabulary as StatusBadge / invitation status chips. */
export function RoleBadge({
  role,
  className,
}: {
  role: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]",
        ROLE_TONE[role] ?? ROLE_TONE.pending,
        className,
      )}
    >
      {role}
    </span>
  );
}
