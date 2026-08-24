import { PageShell } from "@/app/(app)/components/page-shell";
import { ProfileForm } from "@/app/(app)/profile/components/profile-form";
import { PageHeader } from "@/components/page-header";
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
      <PageHeader
        className="max-w-none"
        kicker="Your profile"
        title={displayName}
      />

      <ProfileForm profile={profile} />
    </PageShell>
  );
}
