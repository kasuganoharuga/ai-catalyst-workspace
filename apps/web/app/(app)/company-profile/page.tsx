import { isFounderPreview } from "@ai-catalyst/contracts/actor-context";

import { appPageTitle } from "@/lib/page-metadata";
import { getCurrentFounderActor } from "@/lib/current-founder-actor";
import {
  getMyCompanyProfile,
  resolveCompanyDisplayName,
} from "@/lib/company-profile";

import { PageHeader } from "@/components/page-header";

import { PageShell } from "../components/page-shell";
import { PreviewLockedNotice } from "../components/preview-locked-notice";
import { founderPreviewCopy } from "../lib/copy";
import { CompanyProfileForm } from "./components/company-profile-form";

export const metadata = appPageTitle("Company profile");

export default async function CompanyProfilePage() {
  // getCurrentFounderActor, not getCurrentAppActor: this page is
  // Founder-scoped either way, and reading the profile is safe during
  // preview — it resolves the sandbox Workspace, so there is nothing real
  // to read. Same shape as /profile, which also loads before deciding.
  const actor = await getCurrentFounderActor();
  const profile = await getMyCompanyProfile(actor);
  const displayName = resolveCompanyDisplayName(profile);

  return (
    <PageShell className="max-w-6xl">
      {/* No subtitle, same as Your profile: the fields are labelled, and a
          sentence listing them back is a line people learn to skip. */}
      <PageHeader
        className="max-w-none"
        kicker="Company profile"
        title={displayName}
      />

      {isFounderPreview(actor) ? (
        // Locked for a different reason than /profile and /account-security:
        // company_profiles is keyed by workspace_id, so a previewing
        // Mentor's edits would land on their own sandbox and touch nothing
        // real. It is left out because no module, MCP tool, or artefact
        // generator reads a company profile — it is a closed loop today —
        // so walking the Founder flow never needs it, and a form the
        // sandbox does not consume is only a way to lose work. Hence the
        // custom body: the default notice's "belongs to your real Mentor
        // account" would be false here.
        <PreviewLockedNotice
          feature="Company profile"
          body={founderPreviewCopy.companyProfileLockedBody}
        />
      ) : (
        <CompanyProfileForm profile={profile} />
      )}
    </PageShell>
  );
}
