import type { ReactNode } from "react";
import type { Metadata } from "next";

import { hasChangedInvitationPassword } from "@ai-catalyst/services/profile";

import { Logo } from "@/components/logo";
import { Toaster } from "@/components/ui/toaster";
import { loadAppShellUser } from "@/lib/app-shell";
import { getCurrentAppActor } from "@/lib/current-app-actor";
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

// Shared Founder/Mentor shell — role-specific content decided per page; services re-assert role regardless of this layout guard.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const actor = await getCurrentAppActor();
  const role = actor.role === "mentor" ? "mentor" : "founder";
  const shellUser = await loadAppShellUser(role);

  // The first-run onboarding dialog (assistant choice, invitation password,
  // name) is a Founder-only concept — Mentors don't get one at all. A
  // Mentor's shellUser.preferredAiProvider is always null (see
  // app-shell.ts's loadMentorShellUser), so gating on that alone would also
  // be true for every Mentor; the role check is what actually excludes them.
  const needsOnboarding =
    role === "founder" && shellUser.preferredAiProvider === null;
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
        <AppSidebarNavigation role={role} orientation="horizontal" />
        <div className="justify-self-end">
          <UserMenu
            name={shellUser.displayName}
            email={shellUser.email}
            showDetails={false}
            includeAccountLinks
            role={role}
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
