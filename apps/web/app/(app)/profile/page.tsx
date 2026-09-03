import {
  effectiveRole,
  isFounderPreview,
} from "@ai-catalyst/contracts/actor-context";

import { appPageTitle } from "@/lib/page-metadata";
import {
  getCurrentAppActor,
  getCurrentAppSession,
} from "@/lib/current-app-actor";
import { getMcpConnectionStatus } from "@/lib/mcp-connection";
import { getMyProfile, resolveDisplayName } from "@/lib/user-profile";

import { PageHeader } from "@/components/page-header";

import { PageShell } from "../components/page-shell";
import { PreviewLockedNotice } from "../components/preview-locked-notice";
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

  // The AI assistant choice is a Founder-scoped concept — effectiveRole,
  // not actor.role, since a Mentor previewing the Founder flow connects
  // Claude/ChatGPT to their own sandbox the same way a real Founder does
  // (see packages/services/src/mcp-auth/bearer.ts). A plain Mentor still
  // has no MCP access; getMcpConnectionStatus asserts at the service layer
  // too, so it isn't safe to call for anyone this check excludes.
  const connection =
    effectiveRole(actor) === "founder"
      ? await getMcpConnectionStatus(actor)
      : null;

  return (
    <PageShell className="max-w-6xl">
      {/* No subtitle: the page is called "Your profile", the fields are
          labelled, and a sentence explaining that a profile is how you
          appear is the kind of line people learn to skip. */}
      <PageHeader
        className="max-w-none"
        kicker="Your profile"
        title={displayName}
      />

      {isFounderPreview(actor) ? (
        // Identity fields (name, job title, contact, LinkedIn) belong to
        // the Mentor's real account — user_profiles is keyed by user_id,
        // not Workspace, so editing them here would edit the same row
        // shown once they're back to being a Mentor. The AI-assistant
        // section below is deliberately excluded from this lock: it's the
        // one Founder-side feature previewing exists to let them try.
        <PreviewLockedNotice feature="Profile details" />
      ) : (
        <ProfileForm profile={profile} />
      )}

      {connection ? (
        <AssistantSection
          current={profile.preferredAiProvider}
          connectedProvider={connection.provider}
        />
      ) : null}
    </PageShell>
  );
}
