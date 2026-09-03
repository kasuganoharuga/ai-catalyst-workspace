import type { ReactNode } from "react";

// Shared wrapper for the three module-access gates (missing from run, needs
// run/connection, setup pending) — title, body, and an action slot inside
// the same card. Deliberately NOT used for the `!isLive` "still being
// crafted" notice or the locked banner below it: both use different wrapper
// markup (rounded-[2rem]/bg-muted vs this card's rounded-xl/bg-card, and the
// locked banner has no heading at all).
export function ModuleGateCard({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <div className="mt-10 max-w-3xl rounded-xl border border-border bg-card p-8 shadow-sm">
      <h2 className="font-serif text-xl font-medium tracking-[-0.01em] text-foreground">
        {title}
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
      {children}
    </div>
  );
}
