import { KeyRound } from "lucide-react";
import Link from "next/link";

import { dashboardCopy } from "../../lib/copy";

/** Separate from profile card; hides once invitation password is changed — no skip. */
export function PasswordPrompt() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-lg border-l-2 border-brand-lime bg-muted/50 px-5 py-4">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <KeyRound aria-hidden="true" className="h-4 w-4 shrink-0" />
          {dashboardCopy.passwordPromptTitle}
        </p>
        <p className="mt-0.5 text-sm leading-6 text-muted-foreground">
          {dashboardCopy.passwordPromptBody}
        </p>
      </div>
      <Link
        href="/account-security"
        className="shrink-0 text-sm font-semibold text-foreground underline underline-offset-4"
      >
        {dashboardCopy.passwordPromptCta}
      </Link>
    </div>
  );
}
