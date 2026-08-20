// Outcomes, not features. Each line is what the founder walks away
// holding by the end of that stretch of the programme — the order
// mirrors the module sequence, from first pressure test to the brief
// they can put in front of an investor.
const OUTCOMES = [
  "An honest answer on whether the idea is worth your next six months",
  "A customer you can name, and the reason they would pay",
  "Evidence that separates what you know from what you assume",
  "A business case clear enough to put in front of an investor",
];

// The one deliberately dark surface on this page: it carries the brand
// argument, not UI state. Flat ink with a single lime accent — structure
// comes from numbering and hairlines rather than more colour.
export function SignInBenefitsPanel() {
  return (
    // Hidden below lg, not just stacked: the parent flips flex-col to
    // flex-row at that same breakpoint (page.tsx), and below it this
    // panel isn't a side-by-side second column — it's the whole sign-in
    // page's length again, marketing copy a returning founder has to
    // scroll past to reach a form they've already used before.
    <div className="hidden bg-surface-inverse px-8 py-16 text-surface-inverse-foreground lg:flex lg:w-[46%] lg:shrink-0 lg:flex-col lg:justify-center lg:px-16">
      <div className="mx-auto w-full max-w-sm">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-brand-lime">
          AI Catalyst · Founder Toolkit
        </p>

        <h2 className="mt-8 font-serif text-[2rem] font-medium leading-[1.2] tracking-[-0.01em]">
          Every founder believes their idea is good. This is where you find out.
        </h2>

        <p className="mt-5 text-[13.5px] leading-6 text-surface-inverse-foreground/60">
          A guided program that takes a raw idea apart and rebuilds it into a
          business case — one hard question at a time.
        </p>

        <ol className="mt-10 border-t border-white/10">
          {OUTCOMES.map((outcome, index) => (
            <li
              key={outcome}
              className="flex items-baseline gap-5 border-b border-white/10 py-4"
            >
              <span className="font-mono text-[11px] tabular-nums text-brand-lime">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="text-[13.5px] leading-6 text-surface-inverse-foreground/80">
                {outcome}
              </span>
            </li>
          ))}
        </ol>

        <p className="mt-10 font-mono text-[11px] uppercase tracking-[0.16em] text-white/35">
          Invite only · By cohort
        </p>
      </div>
    </div>
  );
}
