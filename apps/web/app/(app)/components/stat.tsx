import type { ReactNode } from "react";

/**
 * One number in a Stat row — extracted from what was originally a private
 * function on the Founder Dashboard page, now shared with the Mentor
 * overview (both live under the same route group and want the identical
 * big-serif-number treatment).
 */
export function Stat({
  value,
  suffix,
  children,
}: {
  value: string;
  suffix?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 px-5 py-6 sm:first:pl-0 sm:last:pr-0">
      {/* break-words: a defensive backstop, not the fix — see StatRow's
          comment below. Harmless for the short numeric values, which
          never come close to needing it. */}
      <p className="font-serif text-[2rem] font-medium leading-none tabular-nums tracking-[-0.02em] break-words">
        {value}
        {suffix ? (
          <span className="text-lg text-muted-foreground">{suffix}</span>
        ) : null}
      </p>
      <p className="mt-2 text-[13px] text-muted-foreground">{children}</p>
    </div>
  );
}

/**
 * Divider grid for 2–3 Stat children. Stacks below sm; three columns from sm up — phone row layout is too cramped for word-sized values.
 */
export function StatRow({ children }: { children: ReactNode }) {
  return (
    <div className="mt-12 grid grid-cols-1 divide-y divide-border border-y border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {children}
    </div>
  );
}
