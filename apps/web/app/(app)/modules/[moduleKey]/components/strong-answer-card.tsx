/**
 * Side-by-side coaching: what separates an answer the pressure test can
 * bite into from one it can't. Used on Module 1's work step, under the
 * brief — before the founder opens Claude.
 */
export function StrongAnswerCard() {
  return (
    <div className="mt-6 overflow-hidden rounded-lg border border-border">
      <div className="border-b border-border bg-muted/40 px-4 py-2.5">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Strong answers look like this
        </p>
      </div>
      <div className="grid gap-0 sm:grid-cols-2">
        <div className="border-b border-border px-4 py-4 sm:border-b-0 sm:border-r">
          <p className="text-xs font-medium text-muted-foreground">
            Too vague to test
          </p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            &ldquo;Everyone building a startup needs this.&rdquo;
          </p>
        </div>
        <div className="px-4 py-4">
          <p className="text-xs font-medium text-foreground">
            Specific enough to argue with
          </p>
          <p className="mt-2 text-sm leading-6 text-foreground">
            &ldquo;ANZ pre-seed SaaS founders raising their first $500k
            who&apos;ve cold-emailed 50+ investors and stalled.&rdquo;
          </p>
        </div>
      </div>
      <p className="border-t border-border px-4 py-3 text-xs leading-5 text-muted-foreground">
        A real person, a number, and evidence they already tried something.
        Rough wording is fine — specific beats polished every time.
      </p>
    </div>
  );
}
