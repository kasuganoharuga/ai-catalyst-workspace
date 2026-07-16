import type { ReactNode } from "react";

import { getCurrentFounderActor } from "@/lib/current-founder-actor";

import { AppSidebar } from "./components/app-sidebar";

// Every route under this group is Founder-only. This redirect is a
// route-level convenience, not the security boundary — every
// packages/services call re-asserts the actor's role on its own regardless
// of what this layout already checked.
export default async function AppLayout({ children }: { children: ReactNode }) {
  await getCurrentFounderActor();

  return (
    <div className="flex min-h-screen bg-stone-100 text-stone-950">
      <AppSidebar />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
