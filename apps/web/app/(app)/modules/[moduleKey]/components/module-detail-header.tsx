import Link from "next/link";

import type { ModuleCatalogEntry } from "@ai-catalyst/shared";
import { isModuleResetAllowed } from "@ai-catalyst/services/module/reset-allowed";

import { StatusBadge } from "../../../components/status-badge";
import { moduleAccentStyle } from "../../../lib/module-display";
import { deriveModuleDisplayStatus } from "../../../lib/module-status";
import { StatusPill } from "../../components/status-pill";
import type { ModuleDetailModel } from "../lib/load-module-detail";
import { ResetModuleButton } from "./reset-module-button";

export function ModuleDetailHeader({
  entry,
  isCompleted,
  runModule,
  activeAttempt,
  displayAttempt,
}: {
  entry: ModuleCatalogEntry;
  isCompleted: boolean;
  runModule: ModuleDetailModel["runModule"];
  activeAttempt: ModuleDetailModel["activeAttempt"];
  displayAttempt: ModuleDetailModel["displayAttempt"];
}) {
  return (
    <>
      <p className="text-sm font-semibold text-muted-foreground">
        <Link href="/modules" className="hover:underline">
          Modules
        </Link>{" "}
        <span className="text-border">/</span> Module {entry.sequenceIndex}
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span
            className="flex h-11 w-11 items-center justify-center rounded-full font-mono text-sm font-semibold tabular-nums text-white"
            style={moduleAccentStyle(entry.sequenceIndex)}
          >
            {isCompleted ? "✓" : String(entry.sequenceIndex).padStart(2, "0")}
          </span>
          <h1 className="text-4xl font-semibold tracking-tight">
            {entry.title}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {runModule ? (
            <StatusBadge
              status={deriveModuleDisplayStatus(
                runModule.status,
                activeAttempt?.status ?? null,
                displayAttempt?.status ?? null,
              )}
              moduleIndex={entry.sequenceIndex}
            />
          ) : (
            <StatusPill status={entry.catalogStatus} />
          )}
          {isModuleResetAllowed() && runModule ? (
            <ResetModuleButton
              programRunModuleId={runModule.id}
              moduleTitle={entry.title}
            />
          ) : null}
        </div>
      </div>

      {entry.subtitle ? (
        <p className="mt-4 max-w-3xl text-lg leading-8 text-muted-foreground">
          {entry.subtitle}
        </p>
      ) : null}
    </>
  );
}
