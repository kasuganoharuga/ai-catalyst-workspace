import Link from "next/link";

import type { ModuleContext } from "@ai-catalyst/shared";

import { getCurrentFounderActor } from "@/lib/current-founder-actor";
import { getModuleContextByKey, listRunModules } from "@/lib/run-modules";

import { StatusBadge } from "../components/status-badge";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface ArtefactRow {
  moduleKey: string;
  moduleTitle: string;
  sequenceIndex: number;
  name: string;
  requiredFilename: string | null;
  versionNumber: number | null;
  submittedAt: string | null;
}

export default async function ArtefactsPage() {
  const actor = await getCurrentFounderActor();
  const runResult = await listRunModules(actor);

  // Read-only view over what the modules produced: one row per Artifact
  // definition on the Founder's active-branch Modules, joined with its
  // latest saved version. Writing/uploading never happens here — every
  // artefact is saved from Claude through the MCP tools.
  const contexts = (
    await Promise.all(
      runResult.modules.map((runModule) =>
        getModuleContextByKey(actor, runModule.moduleKey),
      ),
    )
  ).filter((context): context is ModuleContext => context !== null);

  const rows: ArtefactRow[] = contexts.flatMap((context) =>
    context.artifacts.map((artifact) => ({
      moduleKey: context.runModule.moduleKey,
      moduleTitle: context.runModule.title,
      sequenceIndex: context.runModule.sequenceIndex,
      name: artifact.name,
      requiredFilename: artifact.requiredFilename,
      versionNumber: artifact.latestSubmission?.versionNumber ?? null,
      submittedAt: artifact.latestSubmission?.submittedAt ?? null,
    })),
  );
  const savedCount = rows.filter((row) => row.versionNumber !== null).length;

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
        Artefacts
      </p>
      <h1 className="mt-5 text-4xl font-semibold tracking-tight">
        Everything your modules produce
      </h1>
      <p className="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">
        Each module ends with a document, saved from Claude straight into your
        workspace storage. They live here — versioned, checked, and ready for
        review when that opens up.
      </p>

      {rows.length === 0 ? (
        <div className="mt-10 rounded-[2rem] border border-border bg-muted/40 p-8 text-center">
          <p className="text-base leading-7 text-muted-foreground">
            Nothing here yet — artefacts appear as you work through modules in
            Claude. Module 0 saves your first one.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-block rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:brightness-95"
          >
            Back to dashboard
          </Link>
        </div>
      ) : (
        <>
          <p className="mt-8 text-sm font-semibold text-muted-foreground">
            {savedCount} of {rows.length} saved
          </p>
          <ul className="mt-4 space-y-4">
            {rows.map((row) => (
              <li
                key={`${row.moduleKey}-${row.name}`}
                className="flex flex-wrap items-center justify-between gap-4 rounded-[2rem] border border-border bg-card p-6 shadow-sm"
              >
                <div className="flex min-w-0 items-center gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-secondary font-mono text-xs font-bold text-secondary-foreground">
                    {String(row.sequenceIndex).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-foreground">
                      {row.name}
                    </p>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {row.moduleTitle}
                      {row.requiredFilename ? (
                        <>
                          {" · "}
                          <span className="font-mono text-xs">
                            {row.requiredFilename}
                          </span>
                        </>
                      ) : null}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {row.versionNumber !== null ? (
                    <>
                      <StatusBadge
                        status={{
                          label: `Saved · v${row.versionNumber}`,
                          tone: "accent",
                        }}
                      />
                      {row.submittedAt ? (
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(row.submittedAt)}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <StatusBadge
                      status={{ label: "Not saved yet", tone: "muted" }}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-8 text-sm leading-6 text-muted-foreground">
            Files are stored securely in your workspace — nothing lives only in
            the chat. Mentor review of these artefacts is coming in a later
            release.
          </p>
        </>
      )}
    </main>
  );
}
