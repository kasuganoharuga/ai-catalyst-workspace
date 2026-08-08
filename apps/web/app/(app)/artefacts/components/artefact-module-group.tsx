import { NotebookPen } from "lucide-react";

import { moduleAccentStyle } from "../../lib/module-display";
import type { ArtefactModuleGroupModel } from "../types";
import { ArtefactDocumentRow } from "./artefact-card";

export function ArtefactModuleGroup({
  group,
}: {
  group: ArtefactModuleGroupModel;
}) {
  const savedCount = group.artefacts.filter(
    (row) =>
      row.versionNumber !== null || row.websiteEvidence?.status === "confirmed",
  ).length;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex items-start gap-4 border-b border-border bg-muted/30 px-5 py-4">
        {group.kind === "handoff" ? (
          // No step number, on purpose: this is what a founder carries
          // between two modules, so numbering it would read as a module of
          // its own and shift everything after it by one.
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
            <NotebookPen className="size-4" aria-hidden="true" />
          </span>
        ) : (
          <span
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold tabular-nums text-white"
            style={moduleAccentStyle(group.sequenceIndex)}
          >
            {String(group.sequenceIndex).padStart(2, "0")}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 className="font-serif text-xl font-medium leading-snug tracking-[-0.01em] text-foreground">
              {group.title}
            </h2>
            <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {savedCount} of {group.artefacts.length} saved
            </p>
          </div>
          {group.subtitle ? (
            <p className="mt-1 text-[13px] leading-6 text-muted-foreground">
              {group.subtitle}
            </p>
          ) : null}
        </div>
      </header>

      <ul className="divide-y divide-border">
        {group.artefacts.map((artefact) => (
          <li key={artefact.artifactKey}>
            <ArtefactDocumentRow artefact={artefact} />
          </li>
        ))}
      </ul>
    </section>
  );
}
