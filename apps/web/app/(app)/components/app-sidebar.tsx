import Link from "next/link";

import { Logo } from "@/components/logo";
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
    <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      <Link href="/dashboard" className="block px-6 py-6">
        <Logo />
      </Link>

      <AppSidebarNavigation />

      <div className="mt-auto border-t border-sidebar-border px-6 py-5">
        <p className="truncate text-sm font-semibold text-foreground">
          {session.user.name}
        </p>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {venture
            ? `${venture.name} · ${venture.lifecycleStage}`
            : "No active Venture yet"}
        </p>
      </div>
    </aside>
  );
}
