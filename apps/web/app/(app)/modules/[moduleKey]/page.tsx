import { notFound } from "next/navigation";

import { ServiceError } from "@ai-catalyst/services/errors";

import { getCurrentFounderActor } from "@/lib/current-founder-actor";
import { getModuleCatalogEntry } from "@/lib/module-catalog";

import { StatusPill } from "../components/status-pill";
import { ExpectedOutputCard } from "./components/expected-output-card";

type ModuleDetailPageProps = {
  params: Promise<{ moduleKey: string }>;
};

export default async function ModuleDetailPage({
  params,
}: ModuleDetailPageProps) {
  const { moduleKey } = await params;
  const actor = await getCurrentFounderActor();

  let entry;
  try {
    entry = await getModuleCatalogEntry(actor, moduleKey);
  } catch (error) {
    if (error instanceof ServiceError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
        Module {String(entry.sequenceIndex).padStart(2, "0")}
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-4xl font-semibold tracking-tight">{entry.title}</h1>
        <StatusPill status={entry.catalogStatus} />
      </div>
      {entry.subtitle ? (
        <p className="mt-4 max-w-3xl text-lg leading-8 text-muted-foreground">
          {entry.subtitle}
        </p>
      ) : null}

      <section className="mt-10 grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="rounded-[2rem] border border-border bg-card p-8 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Purpose
          </h2>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            {entry.description ?? "No description yet."}
          </p>
          {entry.objective ? (
            <>
              <h2 className="mt-8 text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Objective
              </h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                {entry.objective}
              </p>
            </>
          ) : null}
        </div>
        <ExpectedOutputCard artifacts={entry.expectedArtifacts} />
      </section>
    </main>
  );
}
