import type { ModuleCatalogEntry } from "../../types";

export function ExpectedOutputCard({
  artifacts,
}: {
  artifacts: ModuleCatalogEntry["expectedArtifacts"];
}) {
  return (
    <aside className="space-y-4 rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-stone-500">
        Expected output
      </h2>
      {artifacts.length === 0 ? (
        <p className="text-sm text-stone-500">
          This module doesn&apos;t require a submitted artifact.
        </p>
      ) : (
        <ul className="space-y-3">
          {artifacts.map((artifact) => (
            <li
              key={artifact.artifactKey}
              className="rounded-2xl bg-stone-100 px-4 py-3"
            >
              <p className="text-sm font-semibold text-stone-950">
                {artifact.name}
              </p>
              {artifact.requiredFilename ? (
                <p className="mt-1 font-mono text-xs text-stone-500">
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
