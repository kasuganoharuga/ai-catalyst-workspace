import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export function CheckLine({
  ok,
  label,
  detail,
}: {
  ok: boolean;
  label: string;
  detail: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-border/70 py-3 first:border-t-0">
      <dt className="flex items-start gap-2.5">
        <span
          className={cn(
            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
            ok ? "bg-primary" : "border border-border",
          )}
        >
          {ok ? (
            <Check
              aria-hidden="true"
              className="h-2.5 w-2.5 text-primary-foreground"
              strokeWidth={3}
            />
          ) : null}
        </span>
        <span className="text-foreground">{label}</span>
      </dt>
      <dd className="max-w-[16rem] text-right text-xs leading-5 text-muted-foreground">
        {detail}
      </dd>
    </div>
  );
}
