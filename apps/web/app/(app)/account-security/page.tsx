import { isFounderPreview } from "@ai-catalyst/contracts/actor-context";

import { appPageTitle } from "@/lib/page-metadata";
import { getCurrentAppActor } from "@/lib/current-app-actor";

import { PageHeader } from "@/components/page-header";

import { PageShell } from "../components/page-shell";
import { PreviewLockedNotice } from "../components/preview-locked-notice";
import { PasswordSection } from "./components/password-section";

export const metadata = appPageTitle("Account security");

export default async function AccountSecurityPage() {
  const actor = await getCurrentAppActor();

  return (
    <PageShell className="max-w-6xl">
      {/* No subtitle, same as Your profile and Company profile: the one
          thing on this page is labelled by its own heading below. */}
      <PageHeader
        className="max-w-none"
        kicker="Account"
        title="Account security"
      />

      {isFounderPreview(actor) ? (
        // Changing the password signs out other devices and disconnects
        // the AI assistant (see PasswordSection's own success copy) — the
        // last thing previewing should silently do to the Mentor's real
        // session.
        <PreviewLockedNotice feature="Password" />
      ) : (
        <PasswordSection />
      )}
    </PageShell>
  );
}
