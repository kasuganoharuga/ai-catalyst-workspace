import type { ReactNode } from "react";
import type { Metadata } from "next";

import {
  effectiveRole,
  isFounderPreview,
} from "@ai-catalyst/contracts/actor-context";
import { hasChangedInvitationPassword } from "@ai-catalyst/services/profile";

import { Logo } from "@/components/logo";
import { Toaster } from "@/components/ui/toaster";
import { loadAppShellUser } from "@/lib/app-shell";
import { getCurrentAppActor } from "@/lib/current-app-actor";
import { getCurrentFounderActor } from "@/lib/current-founder-actor";

import { AnalyticsIdentify } from "./components/analytics-identify";
import { AppSidebar } from "./components/app-sidebar";
import { AppSidebarNavigation } from "./components/app-sidebar-navigation";
import { FounderPreviewBanner } from "./components/founder-preview-banner";
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
  // effectiveRole, not actor.role: a Mentor previewing the Founder flow
  // gets the Founder shell (nav, sidebar, onboarding) — loadAppShellUser's
  // "founder" branch re-resolves via getCurrentFounderActor(), which is
  // itself preview-aware, so the sandbox Workspace's own data loads here.
  const role = effectiveRole(actor) === "mentor" ? "mentor" : "founder";
  const isPreviewingFounder = isFounderPreview(actor);
  const shellUser = await loadAppShellUser(role);

  // The first-run onboarding dialog (assistant choice, invitation password,
  // name) is a Founder-only concept — Mentors don't get one at all. A
  // Mentor's shellUser.preferredAiProvider is always null (see
  // app-shell.ts's loadMentorShellUser), so gating on that alone would also
  // be true for every Mentor; the role check is what actually excludes them.
  //
  // A previewing Mentor is excluded too, separately from that role check:
  // its password/name steps write to user_profiles and Better Auth's
  // credential row, both keyed by the Mentor's real userId — exactly the
  // fields account-security/page.tsx and profile/page.tsx already lock
  // behind PreviewLockedNotice. Walking a previewing Mentor through them
  // here would edit those same real fields through a side door. The
  // assistant step has no such conflict (AssistantSection stays unlocked
  // during preview for the same reason), but skipping the whole dialog
  // rather than just those two steps also keeps the sandbox itself true to
  // this being a minor, low-friction feature — see /sandbox's own copy.
  // A previewing Mentor who wants a specific assistant can still pick one
  // from their profile page.
  const needsOnboarding =
    role === "founder" &&
    !isPreviewingFounder &&
    shellUser.preferredAiProvider === null;
  const needsPassword = needsOnboarding
    ? !(await hasChangedInvitationPassword(await getCurrentFounderActor()))
    : false;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {isPreviewingFounder ? <FounderPreviewBanner /> : null}
      <div className="flex flex-1 flex-col lg:flex-row">
        <AnalyticsIdentify userId={actor.userId} role={role} />
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
    </div>
  );
}
