import { getActiveContext } from "@/lib/active-context";
import { getCurrentFounderActor } from "@/lib/current-founder-actor";
import { listVentures } from "@/lib/ventures";
import { getMyWorkspace } from "@/lib/workspace";

import { CreateVentureForm } from "./components/create-venture-form";
import { VentureActions } from "./components/venture-actions";

export default async function WorkspacePage() {
  const actor = await getCurrentFounderActor();

  const [workspace, ventures, activeContext] = await Promise.all([
    getMyWorkspace(actor),
    listVentures(actor),
    getActiveContext(actor),
  ]);

  const isWorkspaceActive = workspace.status === "active";

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-[0.34em] text-amber-700">
        Workspace
      </p>
      <h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em]">
        {workspace.name}
      </h1>
      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-stone-500">
        {workspace.status}
      </p>

      {!isWorkspaceActive ? (
        <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">
            This workspace is {workspace.status}. Venture changes are currently
            disabled.
          </p>
        </div>
      ) : null}

      <p className="mt-6 text-lg leading-8 text-stone-700">
        A Venture is an idea you&apos;re currently validating. Create one to get
        started, and switch between them any time.
      </p>

      {isWorkspaceActive ? <CreateVentureForm /> : null}

      <ul className="mt-10 space-y-3">
        {ventures.length === 0 ? (
          <li className="text-sm text-stone-500">No Ventures yet.</li>
        ) : (
          ventures.map((venture) => (
            <li
              key={venture.id}
              className="flex flex-col gap-2 rounded-2xl border border-stone-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-semibold">{venture.name}</p>
                {venture.oneLiner ? (
                  <p className="mt-1 text-sm text-stone-700">
                    {venture.oneLiner}
                  </p>
                ) : null}
                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-stone-500">
                  {venture.status} · {venture.lifecycleStage}
                </p>
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
    </main>
  );
}
