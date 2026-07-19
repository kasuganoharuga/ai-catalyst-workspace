import { SiteHeader } from "@/components/site-header";
import { SignOutButton } from "@/components/sign-out-button";
import { appPageTitle } from "@/lib/page-metadata";
import { requireAuthenticatedUser } from "@/lib/require-active-user";

import { AcceptInvitationForm } from "./accept-invitation-form";

export const metadata = appPageTitle("Awaiting invitation");

export default async function PendingPage() {
  const session = await requireAuthenticatedUser();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-6 py-16">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
          Awaiting invitation
        </p>
        <h1 className="mt-5 text-5xl font-semibold tracking-tight">
          Your account is registered but not yet active.
        </h1>
        <p className="mt-6 text-lg leading-8 text-muted-foreground">
          {session.user.email} is signed in, but Founder and Mentor access is
          currently invitation-only. You&apos;ll be able to reach your workspace
          as soon as an invitation for this email is accepted.
        </p>

        <AcceptInvitationForm />

        <div className="mt-10">
          <SignOutButton />
        </div>
      </main>
    </div>
  );
}
