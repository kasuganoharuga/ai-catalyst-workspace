import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { ServiceError } from "@ai-catalyst/services/errors";

import { getCurrentFounderActor } from "@/lib/current-founder-actor";
import { getModuleCatalogEntry } from "@/lib/module-catalog";
import { appPageTitle } from "@/lib/page-metadata";

import { PageShell } from "../../components/page-shell";
import { ModuleDetailBody } from "./components/module-detail-body";
import { ModuleDetailSkeleton } from "./components/module-detail-skeleton";

type ModuleDetailPageProps = {
  params: Promise<{ moduleKey: string }>;
};

export async function generateMetadata({
  params,
}: ModuleDetailPageProps): Promise<Metadata> {
  const { moduleKey } = await params;
  try {
    const actor = await getCurrentFounderActor();
    const entry = await getModuleCatalogEntry(actor, moduleKey);
    return appPageTitle(entry.title);
  } catch (error) {
    if (error instanceof ServiceError && error.code === "NOT_FOUND") {
      return appPageTitle("Module");
    }
    throw error;
  }
}

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

  // Setup (Module 0) is a single column — no right rail — so keep the shell
  // at the same width as the walkthrough. Other modules keep the wider
  // shell for the content + "where you're up to" grid.
  const shellWidth = entry.moduleType === "setup" ? "max-w-3xl" : "max-w-6xl";

  return (
    <PageShell className={`${shellWidth} py-16`}>
      <Suspense
        fallback={
          <ModuleDetailSkeleton singleColumn={entry.moduleType === "setup"} />
        }
      >
        <ModuleDetailBody moduleKey={moduleKey} entry={entry} />
      </Suspense>
    </PageShell>
  );
}
