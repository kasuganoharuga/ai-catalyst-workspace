import type { ModuleCatalogEntry } from "../../types";

export function ExpectedOutputCard({
  artifacts,
}: {
  artifacts: ModuleCatalogEntry["expectedArtifacts"];
}) {
  return (
    <aside className="space-y-4 rounded-[2rem] border border-border bg-card p-6 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Expected output
      </h2>
      {artifacts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          This module doesn&apos;t require a submitted artifact.
        </p>
      ) : (
        <ul className="space-y-4">
          {artifacts.map((artifact) => (
            <li
              key={artifact.artifactKey}
              className="rounded-2xl bg-secondary px-4 py-3"
            >
              <p className="text-sm font-semibold text-secondary-foreground">
                {artifact.name}
              </p>
              {artifact.requiredFilename ? (
                <p className="mt-1 font-mono text-xs text-secondary-foreground/70">
                  {artifact.requiredFilename}
                </p>
              ) : null}
              {artifact.outline.length > 0 ? (
                <ol className="mt-3 space-y-1 border-t border-secondary-foreground/10 pt-3 text-xs text-secondary-foreground/80">
                  {artifact.outline.map((section, index) => (
                    <li key={section.heading} className="flex gap-2">
                      <span className="w-3.5 shrink-0 font-mono tabular-nums text-secondary-foreground/50">
                        {index + 1}.
                      </span>
                      <span>{section.heading}</span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
