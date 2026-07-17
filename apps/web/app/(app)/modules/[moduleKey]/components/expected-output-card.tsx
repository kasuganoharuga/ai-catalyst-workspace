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
        <ul className="space-y-3">
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
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
