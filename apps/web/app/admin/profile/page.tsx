import { PageShell } from "@/app/(app)/components/page-shell";
import { ProfileForm } from "@/app/(app)/profile/components/profile-form";
import { actorContextFromSession } from "@/lib/actor-context";
import { appPageTitle } from "@/lib/page-metadata";
import { requireAdminUser } from "@/lib/require-active-user";
import { getMyProfile, resolveDisplayName } from "@/lib/user-profile";

export const metadata = appPageTitle("Your profile");

export default async function AdminProfilePage() {
  const session = await requireAdminUser();
  const actor = actorContextFromSession(session);
  const profile = await getMyProfile(actor);
  const displayName = resolveDisplayName(profile, session.user.name);

  return (
    <PageShell className="max-w-6xl">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        Your profile
      </p>
      <h1 className="mt-4 font-serif text-[2.25rem] font-medium leading-tight tracking-[-0.02em]">
        {displayName}
      </h1>

      <ProfileForm profile={profile} />
    </PageShell>
  );
}
