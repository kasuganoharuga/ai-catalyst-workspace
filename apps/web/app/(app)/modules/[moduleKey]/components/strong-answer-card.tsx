import type { ModuleCoachingCard } from "../../../lib/copy";

/**
 * Optional weak vs strong coaching card on the work step (copy.coachingCard) — renders nothing when absent.
 */
export function StrongAnswerCard({
  card,
}: {
  card: ModuleCoachingCard | undefined;
}) {
  if (!card) return null;

  return (
    <div className="mt-6 overflow-hidden rounded-lg border border-border">
      <div className="border-b border-border bg-muted/40 px-4 py-2.5">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {card.heading}
        </p>
      </div>
      <div className="grid gap-0 sm:grid-cols-2">
        <div className="border-b border-border px-4 py-4 sm:border-b-0 sm:border-r">
          <p className="text-xs font-medium text-muted-foreground">
            {card.weakLabel}
          </p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            &ldquo;{card.weakExample}&rdquo;
          </p>
        </div>
        <div className="px-4 py-4">
          <p className="text-xs font-medium text-foreground">
            {card.strongLabel}
          </p>
          <p className="mt-2 text-sm leading-6 text-foreground">
            &ldquo;{card.strongExample}&rdquo;
          </p>
        </div>
      </div>
      {/* "Rough wording is fine" already appears in the brief's Before you
          start list; saying it twice on one screen made it read as filler. */}
      <p className="border-t border-border px-4 py-3 text-xs leading-5 text-muted-foreground">
        {card.footer}
      </p>
    </div>
  );
}
