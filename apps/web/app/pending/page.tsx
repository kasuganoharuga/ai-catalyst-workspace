import { SiteHeader } from "@/components/site-header";
import { SignOutButton } from "@/components/sign-out-button";
import { requireAuthenticatedUser } from "@/lib/require-active-user";

export default async function PendingPage() {
  const session = await requireAuthenticatedUser();

  return (
    <div className="min-h-screen bg-stone-100 text-stone-950">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-6 py-16">
        <p className="text-sm font-semibold uppercase tracking-[0.34em] text-amber-700">
          Awaiting invitation
        </p>
        <h1 className="mt-5 text-5xl font-semibold tracking-[-0.04em]">
          Your account is registered but not yet active.
        </h1>
        <p className="mt-6 text-lg leading-8 text-stone-700">
          {session.user.email} is signed in, but Founder and Mentor access is
          currently invitation-only. You&apos;ll be able to reach your workspace
          as soon as an invitation for this email is accepted.
        </p>
        <div className="mt-10">
          <SignOutButton />
        </div>
      </main>
    </div>
  );
}
