import type { ReactNode } from "react";
import type { Metadata } from "next";

import { Logo } from "@/components/logo";
import { Toaster } from "@/components/ui/toaster";
import { loadAppShellUser } from "@/lib/app-shell";

import { AppSidebar } from "./components/app-sidebar";
import { AppSidebarNavigation } from "./components/app-sidebar-navigation";
import { UserMenu } from "./components/user-menu";

export const metadata: Metadata = {
  title: {
    template: "%s · AI Catalyst",
    default: "Founder Toolkit",
  },
};

// Every route under this group is Founder-only. This redirect is a
// route-level convenience, not the security boundary — every
// packages/services call re-asserts the actor's role on its own regardless
// of what this layout already checked.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const shellUser = await loadAppShellUser();

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
            name={shellUser.displayName}
            email={shellUser.email}
            showDetails={false}
            includeAccountLinks
            side="bottom"
            align="end"
          />
        </div>
      </header>
      <AppSidebar user={shellUser} />
      <main className="min-w-0 flex-1">{children}</main>
      <Toaster />
    </div>
  );
}
