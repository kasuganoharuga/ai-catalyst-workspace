import Link from "next/link";

import { getActiveContext } from "@/lib/active-context";
import {
  getCurrentFounderActor,
  getCurrentFounderSession,
} from "@/lib/current-founder-actor";
import { getVenture } from "@/lib/ventures";

import { AppSidebarNavigation } from "./app-sidebar-navigation";

export async function AppSidebar() {
  const [actor, session] = await Promise.all([
    getCurrentFounderActor(),
    getCurrentFounderSession(),
  ]);

  const activeContext = await getActiveContext(actor);
  const venture = activeContext.ventureId
    ? await getVenture(actor, activeContext.ventureId)
    : null;

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-stone-200 bg-white">
      <Link href="/modules" className="block px-6 py-6">
        <span className="block text-xs font-semibold uppercase tracking-[0.34em] text-amber-700">
          AI Catalyst
        </span>
        <span className="text-lg font-semibold tracking-tight text-stone-950">
          Founder Toolkit
        </span>
      </Link>

      <AppSidebarNavigation />

      <div className="mt-auto border-t border-stone-200 px-6 py-5">
        <p className="truncate text-sm font-semibold text-stone-950">
          {session.user.name}
        </p>
        <p className="mt-1 truncate text-xs text-stone-500">
          {venture
            ? `${venture.name} · ${venture.lifecycleStage}`
            : "No active Venture yet"}
        </p>
      </div>
    </aside>
  );
}
