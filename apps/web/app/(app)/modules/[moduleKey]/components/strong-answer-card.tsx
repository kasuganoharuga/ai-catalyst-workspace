/**
 * Static coaching example (design frame H6b): what separates an answer
 * the pressure test can bite into from one it can't.
 */
export function StrongAnswerCard() {
  return (
    <div className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-sm">
      <div className="border-b border-border bg-accent/60 px-6 py-4">
        <h2 className="text-sm font-semibold text-accent-foreground">
          What makes an answer worth pressure-testing
        </h2>
      </div>
      <div className="space-y-4 px-6 py-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Too vague to test
          </p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            &ldquo;Everyone building a startup needs this.&rdquo;
          </p>
        </div>
        <div className="h-px bg-border/60" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground">
            Specific enough to argue with
          </p>
          <p className="mt-1 text-sm leading-6 text-foreground">
            &ldquo;ANZ pre-seed SaaS founders raising their first $500k
            who&apos;ve cold-emailed 50+ investors and stalled.&rdquo;
          </p>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          A real person, a number, and evidence they already tried something.
          Rough wording is fine — specific beats polished every time.
        </p>
      </div>
    </div>
  );
}
