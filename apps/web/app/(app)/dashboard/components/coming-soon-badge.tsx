import { cn } from "@/lib/utils";

export function ComingSoonBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "rounded-full bg-muted px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground",
        className,
      )}
    >
      Coming soon
    </span>
  );
}
