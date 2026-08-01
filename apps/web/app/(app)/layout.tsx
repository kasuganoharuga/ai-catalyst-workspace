import type { ReactNode } from "react";
import type { Metadata } from "next";

import { hasChangedInvitationPassword } from "@ai-catalyst/services/profile";

import { Logo } from "@/components/logo";
import { Toaster } from "@/components/ui/toaster";
import { loadAppShellUser } from "@/lib/app-shell";
import { getCurrentFounderActor } from "@/lib/current-founder-actor";

import { AppSidebar } from "./components/app-sidebar";
import { AppSidebarNavigation } from "./components/app-sidebar-navigation";
import { OnboardingDialog } from "./components/onboarding/onboarding-dialog";
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

  // Every route in this group needs the first-run dialog, and none of the
  // OAuth routes do — they sit outside this layout, which is what keeps a
  // founder from being interrupted halfway through approving a connection.
  //
  // The extra query only runs for accounts that still owe us a choice; a
  // founder who has chosen never pays for it. `loadAppShellUser` already
  // loaded the profile, so the other two signals are free.
  const needsOnboarding = shellUser.preferredAiProvider === null;
  const needsPassword = needsOnboarding
    ? !(await hasChangedInvitationPassword(await getCurrentFounderActor()))
    : false;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground lg:flex-row">
      {/* Below lg the sidebar is hidden and this bar takes over. Three
         equal-weight grid columns rather than a flex row, so the nav sits
         optically centred regardless of how wide the logo or avatar are.
         `min-w-8` on the logo is load-bearing: it is a replaced element
         (an <img>), and a grid item's default `min-width: auto` lets a
         replaced element shrink well below its own explicit size once the
         middle "Dashboard / Modules / Artefacts" nav — an `auto` track —
         claims its full content width on a narrow screen. Without it the
         mark compresses to a sliver instead of the nav (which already
         scrolls horizontally via overflow-x-auto) giving way first. */}
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-border px-4 py-2.5 lg:hidden">
        <Logo variant="compact" className="min-w-8 shrink-0" />
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
      {needsOnboarding ? (
        <OnboardingDialog
          needsPassword={needsPassword}
          needsName={!shellUser.hasName}
        />
      ) : null}
      <Toaster />
    </div>
  );
}
