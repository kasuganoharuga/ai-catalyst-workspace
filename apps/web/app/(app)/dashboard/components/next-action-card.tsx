import type { ReactNode } from "react";

/** Dark card for the single next action on the dashboard. */
export function NextActionCard({
  kicker = "Next",
  title,
  body,
  children,
}: {
  /** "First" on the opening step; "Next" afterwards. */
  kicker?: string;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <section className="flex flex-wrap items-end justify-between gap-6 rounded-xl bg-surface-inverse px-7 py-6 text-surface-inverse-foreground">
      <div className="max-w-xl">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-brand-lime">
          {kicker}
        </p>
        <h2 className="mt-3 font-serif text-2xl font-medium leading-snug tracking-[-0.01em]">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-surface-inverse-foreground/60">
          {body}
        </p>
      </div>
      {children ? <div className="shrink-0">{children}</div> : null}
    </section>
  );
}
