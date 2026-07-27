import { KeyRound } from "lucide-react";
import Link from "next/link";

import { dashboardCopy } from "../../lib/copy";

/**
 * Shown until the founder replaces the password their invitation shipped
 * with.
 *
 * Deliberately independent of the profile card above it. This used to be
 * a sentence inside that card, which meant it disappeared the moment a
 * name was saved — the prompt ended when the unrelated task did, and an
 * account still on an emailed password never heard about it again.
 *
 * No dismiss control, because unlike the name prompt this resolves
 * itself: `hasChangedInvitationPassword` flips as soon as the password is
 * changed and the block stops rendering. Styled quietly all the same — it
 * is a standing recommendation, not an alarm.
 */
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
        href="/profile"
        className="shrink-0 text-sm font-semibold text-foreground underline underline-offset-4"
      >
        {dashboardCopy.passwordPromptCta}
      </Link>
    </div>
  );
}
