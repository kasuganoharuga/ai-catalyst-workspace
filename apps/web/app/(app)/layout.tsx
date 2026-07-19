import type { ReactNode } from "react";

import { Logo } from "@/components/logo";
import {
  getCurrentFounderActor,
  getCurrentFounderSession,
} from "@/lib/current-founder-actor";
import { getMyProfile, resolveDisplayName } from "@/lib/user-profile";

import { AppSidebar } from "./components/app-sidebar";
import { AppSidebarNavigation } from "./components/app-sidebar-navigation";
import { UserMenu } from "./components/user-menu";

// Every route under this group is Founder-only. This redirect is a
// route-level convenience, not the security boundary — every
// packages/services call re-asserts the actor's role on its own regardless
// of what this layout already checked.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const actor = await getCurrentFounderActor();
  const [session, profile] = await Promise.all([
    getCurrentFounderSession(),
    getMyProfile(actor),
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground lg:flex-row">
      {/* Below lg the sidebar is hidden and this bar takes over. Three
         equal-weight grid columns rather than a flex row, so the nav sits
         optically centred regardless of how wide the logo or avatar are. */}
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-border px-4 py-2.5 lg:hidden">
        <Logo variant="compact" />
        <AppSidebarNavigation orientation="horizontal" />
        <div className="justify-self-end">
          <UserMenu
            name={resolveDisplayName(profile, session.user.name)}
            email={session.user.email}
            showDetails={false}
            includeAccountLinks
            side="bottom"
            align="end"
          />
        </div>
      </header>
      <AppSidebar />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
