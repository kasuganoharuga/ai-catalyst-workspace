import { appPageTitle } from "@/lib/page-metadata";
import {
  getCurrentFounderActor,
  getCurrentFounderSession,
} from "@/lib/current-founder-actor";
import { getMyProfile, resolveDisplayName } from "@/lib/user-profile";

import { PageShell } from "../components/page-shell";
import { PasswordSection } from "./components/password-section";
import { ProfileForm } from "./components/profile-form";

export const metadata = appPageTitle("Your profile");

export default async function ProfilePage() {
  const [actor, session] = await Promise.all([
    getCurrentFounderActor(),
    getCurrentFounderSession(),
  ]);

  const profile = await getMyProfile(actor);
  const displayName = resolveDisplayName(profile, session.user.name);

  return (
    <PageShell className="max-w-2xl">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        Your profile
      </p>
      <h1 className="mt-4 font-serif text-[2.25rem] font-medium leading-tight tracking-[-0.02em]">
        {displayName}
      </h1>
      <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
        How you appear across the programme. Your name here is what the rest of
        the toolkit greets you by.
      </p>

      <ProfileForm profile={profile} />

      <PasswordSection />
    </PageShell>
  );
}
