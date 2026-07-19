import Link from "next/link";

import { Logo } from "@/components/logo";
import { getActiveContext } from "@/lib/active-context";
import {
  getCurrentFounderActor,
  getCurrentFounderSession,
} from "@/lib/current-founder-actor";
import { getMyProfile, resolveDisplayName } from "@/lib/user-profile";
import { getVenture } from "@/lib/ventures";

import { AppSidebarNavigation } from "./app-sidebar-navigation";
import { UserMenu } from "./user-menu";

export async function AppSidebar() {
  const [actor, session] = await Promise.all([
    getCurrentFounderActor(),
    getCurrentFounderSession(),
  ]);

  const [activeContext, profile] = await Promise.all([
    getActiveContext(actor),
    getMyProfile(actor),
  ]);
  const venture = activeContext.ventureId
    ? await getVenture(actor, activeContext.ventureId)
    : null;

  return (
    // Sticky full-height column: navigation and the account menu stay
    // reachable no matter how long the page below scrolls.
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      <Link href="/dashboard" className="block px-6 py-6">
        <Logo />
      </Link>

      <AppSidebarNavigation />

      <div className="mt-auto border-t border-sidebar-border p-3">
        <UserMenu
          name={resolveDisplayName(profile, session.user.name)}
          email={session.user.email}
          subtitle={venture ? venture.name : "No active venture"}
          side="top"
          align="start"
        />
      </div>
    </aside>
  );
}
