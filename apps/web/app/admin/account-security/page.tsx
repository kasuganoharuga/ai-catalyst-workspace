import { PasswordSection } from "@/app/(app)/account-security/components/password-section";
import { PageShell } from "@/app/(app)/components/page-shell";
import { appPageTitle } from "@/lib/page-metadata";

export const metadata = appPageTitle("Account security");

export default function AdminAccountSecurityPage() {
  return (
    <PageShell className="max-w-6xl">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        Account
      </p>
      <h1 className="mt-4 font-serif text-[2.25rem] font-medium leading-tight tracking-[-0.02em]">
        Account security
      </h1>

      <PasswordSection
        successNote="Password updated. Other devices have been signed out."
        forgotPasswordCopy="Reset-by-email isn't switched on yet. Until it is, use another admin account or recover access through your deployment operator."
      />
    </PageShell>
  );
}
