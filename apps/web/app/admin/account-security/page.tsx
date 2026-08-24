import { PasswordSection } from "@/app/(app)/account-security/components/password-section";
import { PageShell } from "@/app/(app)/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { appPageTitle } from "@/lib/page-metadata";

export const metadata = appPageTitle("Account security");

export default function AdminAccountSecurityPage() {
  return (
    <PageShell className="max-w-6xl">
      <PageHeader
        className="max-w-none"
        kicker="Account"
        title="Account security"
      />

      <PasswordSection
        successNote="Password updated. Other devices have been signed out."
        forgotPasswordCopy="Reset-by-email isn't switched on yet. Until it is, use another admin account or recover access through your deployment operator."
      />
    </PageShell>
  );
}
