import { appPageTitle } from "@/lib/page-metadata";
import {
  getCurrentFounderActor,
  getCurrentFounderSession,
} from "@/lib/current-founder-actor";
import { getMcpConnectionStatus } from "@/lib/mcp-connection";
import { getMyProfile, resolveDisplayName } from "@/lib/user-profile";

import { PageShell } from "../components/page-shell";
import { AssistantSection } from "./components/assistant-section";
import { PasswordSection } from "./components/password-section";
import { ProfileForm } from "./components/profile-form";

export const metadata = appPageTitle("Your profile");

export default async function ProfilePage() {
  const [actor, session] = await Promise.all([
    getCurrentFounderActor(),
    getCurrentFounderSession(),
  ]);

  const [profile, connection] = await Promise.all([
    getMyProfile(actor),
    getMcpConnectionStatus(actor),
  ]);
  const displayName = resolveDisplayName(profile, session.user.name);

  return (
    <PageShell className="max-w-6xl">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        Your profile
      </p>
      {/* No subtitle: the page is called "Your profile", the fields are
          labelled, and a sentence explaining that a profile is how you
          appear is the kind of line people learn to skip. */}
      <h1 className="mt-4 font-serif text-[2.25rem] font-medium leading-tight tracking-[-0.02em]">
        {displayName}
      </h1>

      <ProfileForm profile={profile} />

      {/* Above the password section: this is a preference a founder may
          come here to change, while the password is something they arrive
          at knowing they need. */}
      <AssistantSection
        current={profile.preferredAiProvider}
        connectedProvider={connection.provider}
      />

      <PasswordSection />
    </PageShell>
  );
}
