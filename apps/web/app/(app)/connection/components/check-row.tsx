import { Check, Minus } from "lucide-react";

// Tick = vouched for; dash = inferred only.
export function CheckRow({
  label,
  ok,
  children,
}: {
  label: string;
  ok?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/70 py-3 last:border-b-0">
      <dt className="flex items-center gap-2.5 text-muted-foreground">
        {ok ? (
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary">
            <Check
              aria-hidden="true"
              className="h-2.5 w-2.5 text-primary-foreground"
              strokeWidth={3}
            />
          </span>
        ) : (
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border">
            <Minus
              aria-hidden="true"
              className="h-2.5 w-2.5 text-muted-foreground"
              strokeWidth={3}
            />
          </span>
        )}
        {label}
      </dt>
      <dd className="min-w-0 truncate text-right font-medium text-foreground">
        {children}
      </dd>
    </div>
  );
}
