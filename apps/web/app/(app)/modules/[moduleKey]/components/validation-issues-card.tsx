import type { ArtifactValidation } from "@ai-catalyst/shared";

/**
 * When the latest check didn't pass: the real failure reasons from the
 * Validator, phrased as things to fix in the assistant. Shell matches
 * RetryPassCard / module cards (rounded-xl, muted header) — not a separate
 * pink alert language.
 */
export function ValidationIssuesCard({
  validation,
}: {
  validation: ArtifactValidation;
}) {
  const failedChecks = validation.checks.filter((check) => !check.passed);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border bg-muted/40 px-5 py-4 sm:px-6">
        <h2 className="font-serif text-xl font-medium tracking-[-0.01em] text-foreground">
          A few gaps to close
        </h2>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
          Ask your AI assistant to work through the points below and save an
          updated version. This page picks it up from there.
        </p>
      </div>
      <ul className="space-y-3 px-5 py-5 sm:px-6">
        {(validation.issues.length > 0
          ? validation.issues
          : failedChecks.map((check) => check.message ?? check.key)
        ).map((issue, index) => (
          <li key={index} className="flex items-start gap-3 text-sm leading-6">
            <span
              className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/50"
              aria-hidden="true"
            />
            <span className="text-foreground">{issue}</span>
          </li>
        ))}
      </ul>
      {validation.warnings.length > 0 ? (
        <div className="border-t border-border bg-muted/30 px-5 py-4 sm:px-6">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Worth a look, but not blocking
          </p>
          <ul className="mt-2 space-y-1.5">
            {validation.warnings.map((warning, index) => (
              <li
                key={index}
                className="text-sm leading-6 text-muted-foreground"
              >
                {warning}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
