import { appPageTitle } from "@/lib/page-metadata";
import {
  getCurrentAppActor,
  getCurrentAppSession,
} from "@/lib/current-app-actor";
import { getMcpConnectionStatus } from "@/lib/mcp-connection";
import { getMyProfile, resolveDisplayName } from "@/lib/user-profile";

import { PageShell } from "../components/page-shell";
import { AssistantSection } from "./components/assistant-section";
import { ProfileForm } from "./components/profile-form";

export const metadata = appPageTitle("Your profile");

export default async function ProfilePage() {
  const [actor, session] = await Promise.all([
    getCurrentAppActor(),
    getCurrentAppSession(),
  ]);

  const profile = await getMyProfile(actor);
  const displayName = resolveDisplayName(profile, session.user.name);

  // The AI assistant choice is a Founder-only concept — a Mentor has no
  // MCP access to connect (see packages/services/src/mcp-auth's
  // founder-only allowlist), and getMcpConnectionStatus asserts founder at
  // the service layer, so it isn't safe to call for anyone else.
  const connection =
    actor.role === "founder" ? await getMcpConnectionStatus(actor) : null;

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

      {connection ? (
        <AssistantSection
          current={profile.preferredAiProvider}
          connectedProvider={connection.provider}
        />
      ) : null}
    </PageShell>
  );
}
