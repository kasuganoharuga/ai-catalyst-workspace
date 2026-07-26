import { getActiveContext } from "@/lib/active-context";
import { getCurrentFounderActor } from "@/lib/current-founder-actor";
import { listVentures } from "@/lib/ventures";
import { getMyWorkspace } from "@/lib/workspace";
import { appPageTitle } from "@/lib/page-metadata";
import { SHOW_CLAUDE_PROJECT } from "@/lib/feature-flags";

import { PageShell } from "../components/page-shell";
import {
  lifecycleStageLabel,
  ventureStatusLabel,
  workspaceCopy,
} from "../lib/copy";
import { CreateVentureForm } from "./components/create-venture-form";
import { VentureActions } from "./components/venture-actions";
import { VentureClaudeProjectField } from "./components/venture-claude-project-field";

export const metadata = appPageTitle("Workspace");

export default async function WorkspacePage() {
  const actor = await getCurrentFounderActor();

  const [workspace, ventures, activeContext] = await Promise.all([
    getMyWorkspace(actor),
    listVentures(actor),
    getActiveContext(actor),
  ]);

  const isWorkspaceActive = workspace.status === "active";

  return (
    /* Type scale matched to every other page in the app: this one was
       still on an older set (0.3em kicker, text-4xl heading, text-lg body)
       and read as a different product. */
    <PageShell className="max-w-4xl">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {workspaceCopy.kicker}
      </p>
      <h1 className="mt-4 font-serif text-[2.25rem] font-medium leading-tight tracking-[-0.02em]">
        {workspace.name}
      </h1>
      <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
        {workspaceCopy.intro}
      </p>

      {!isWorkspaceActive ? (
        <div className="mt-6 rounded-xl border border-border bg-muted/40 px-5 py-4">
          <p className="text-sm leading-6 text-muted-foreground">
            {workspaceCopy.inactiveNotice(workspace.status)}
          </p>
        </div>
      ) : null}

      {isWorkspaceActive ? <CreateVentureForm /> : null}

      <ul className="mt-10 space-y-3">
        {ventures.length === 0 ? (
          <li className="text-sm text-muted-foreground">
            {workspaceCopy.empty}
          </li>
        ) : (
          ventures.map((venture) => (
            <li
              key={venture.id}
              className="flex flex-col gap-2 rounded-2xl border border-border bg-card px-5 py-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{venture.name}</p>
                {venture.oneLiner ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {venture.oneLiner}
                  </p>
                ) : null}
                {/* Labelled, not raw: these are database enums, and
                    "company_formed" was reaching the screen intact. */}
                <p className="mt-1 text-xs text-muted-foreground">
                  {ventureStatusLabel(venture.status)} ·{" "}
                  {lifecycleStageLabel(venture.lifecycleStage)}
                </p>
                {SHOW_CLAUDE_PROJECT ? (
                  <VentureClaudeProjectField
                    ventureId={venture.id}
                    initialProjectId={venture.claudeProjectId}
                    canEdit={isWorkspaceActive}
                    isArchived={venture.status === "archived"}
                  />
                ) : null}
              </div>
              <VentureActions
                ventureId={venture.id}
                isArchived={venture.status === "archived"}
                isSelected={activeContext.ventureId === venture.id}
                canArchive={isWorkspaceActive}
              />
            </li>
          ))
        )}
      </ul>
    </PageShell>
  );
}
