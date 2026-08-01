import type { ArtifactValidation } from "@ai-catalyst/shared";

/**
 * When the latest check didn't pass (design frames H5b/H6e): the real
 * failure reasons from the Validator, phrased as things to fix in the
 * assistant rather than a wall of red.
 */
export function ValidationIssuesCard({
  validation,
}: {
  validation: ArtifactValidation;
}) {
  const failedChecks = validation.checks.filter((check) => !check.passed);

  return (
    <div className="overflow-hidden rounded-[2rem] border border-destructive/30 bg-card shadow-sm">
      <div className="border-b border-destructive/20 bg-destructive/5 px-6 py-4">
        <h2 className="text-base font-semibold text-foreground">
          A few gaps to close
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Ask your AI assistant to work through the points below and save an
          updated version. This page picks it up from there.
        </p>
      </div>
      <ul className="space-y-3 px-6 py-5">
        {(validation.issues.length > 0
          ? validation.issues
          : failedChecks.map((check) => check.message ?? check.key)
        ).map((issue, index) => (
          <li key={index} className="flex items-start gap-3 text-sm leading-6">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
            <span className="text-foreground">{issue}</span>
          </li>
        ))}
      </ul>
      {validation.warnings.length > 0 ? (
        <div className="border-t border-border bg-muted/40 px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
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
