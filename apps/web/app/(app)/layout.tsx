import type { ReactNode } from "react";

import { Logo } from "@/components/logo";
import { getCurrentFounderActor } from "@/lib/current-founder-actor";

import { AppSidebar } from "./components/app-sidebar";
import { AppSidebarNavigation } from "./components/app-sidebar-navigation";

// Every route under this group is Founder-only. This redirect is a
// route-level convenience, not the security boundary — every
// packages/services call re-asserts the actor's role on its own regardless
// of what this layout already checked.
export default async function AppLayout({ children }: { children: ReactNode }) {
  await getCurrentFounderActor();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground lg:flex-row">
      {/* Below lg, AppSidebar is hidden and this bar is the only nav — a
         minimal fallback, not a full drawer, for this pass. */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3 lg:hidden">
        <Logo variant="compact" />
        <AppSidebarNavigation orientation="horizontal" />
      </div>
      <AppSidebar />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
