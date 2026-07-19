import { appPageTitle } from "@/lib/page-metadata";
import { getCurrentFounderActor } from "@/lib/current-founder-actor";
import {
  getMyCompanyProfile,
  resolveCompanyDisplayName,
} from "@/lib/company-profile";

import { PageShell } from "../components/page-shell";
import { CompanyProfileForm } from "./components/company-profile-form";

export const metadata = appPageTitle("Company profile");

export default async function CompanyProfilePage() {
  const actor = await getCurrentFounderActor();
  const profile = await getMyCompanyProfile(actor);
  const displayName = resolveCompanyDisplayName(profile);

  return (
    <PageShell className="max-w-2xl">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        Company profile
      </p>
      <h1 className="mt-4 font-serif text-[2.25rem] font-medium leading-tight tracking-[-0.02em]">
        {displayName}
      </h1>
      <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
        How you describe your company to the outside world — website, location,
        and a clear summary of what you do.
      </p>

      <CompanyProfileForm profile={profile} />
    </PageShell>
  );
}
