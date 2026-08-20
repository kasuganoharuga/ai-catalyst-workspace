import { appPageTitle } from "@/lib/page-metadata";

import { PageShell } from "../components/page-shell";
import { PasswordSection } from "./components/password-section";

export const metadata = appPageTitle("Account security");

export default function AccountSecurityPage() {
  return (
    <PageShell className="max-w-6xl">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        Account
      </p>
      {/* No subtitle, same as Your profile and Company profile: the one
          thing on this page is labelled by its own heading below. */}
      <h1 className="mt-4 font-serif text-[2.25rem] font-medium leading-tight tracking-[-0.02em]">
        Account security
      </h1>

      <PasswordSection />
    </PageShell>
  );
}
