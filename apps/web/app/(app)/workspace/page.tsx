import { getActiveContext } from "@/lib/active-context";
import { getCurrentFounderActor } from "@/lib/current-founder-actor";
import { listVentures } from "@/lib/ventures";
import { getMyWorkspace } from "@/lib/workspace";
import { appPageTitle } from "@/lib/page-metadata";

import { PageShell } from "../components/page-shell";
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
    <PageShell className="max-w-4xl py-16">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
        Workspace
      </p>
      <h1 className="mt-5 text-4xl font-semibold tracking-tight">
        {workspace.name}
      </h1>
      <p className="mt-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
        {workspace.status}
      </p>

      {!isWorkspaceActive ? (
        <div className="mt-6 rounded-2xl border border-accent bg-accent p-4">
          <p className="text-sm text-accent-foreground">
            This workspace is {workspace.status}. Venture changes are currently
            disabled.
          </p>
        </div>
      ) : null}

      <p className="mt-6 text-lg leading-8 text-muted-foreground">
        A Venture is an idea you&apos;re currently validating. Create one to get
        started, and switch between them any time.
      </p>

      {isWorkspaceActive ? <CreateVentureForm /> : null}

      <ul className="mt-10 space-y-3">
        {ventures.length === 0 ? (
          <li className="text-sm text-muted-foreground">No Ventures yet.</li>
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
                <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  {venture.status} · {venture.lifecycleStage}
                </p>
                <VentureClaudeProjectField
                  ventureId={venture.id}
                  initialProjectId={venture.claudeProjectId}
                  canEdit={isWorkspaceActive}
                  isArchived={venture.status === "archived"}
                />
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
