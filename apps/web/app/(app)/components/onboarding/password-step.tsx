"use client";

import { onboardingCopy } from "../../lib/copy";
import { PasswordChangeForm } from "../password-change-form";

/**
 * Required, like every other step in this dialog — and it does not ask for
 * the invitation password, because reaching this dialog required typing it
 * moments ago. See PasswordChangeForm's `"initial"` mode for what stands
 * in for that check and why the trade is only acceptable here.
 */
export function PasswordStep({ onDone }: { onDone: () => void }) {
  return (
    <PasswordChangeForm
      mode="initial"
      submitLabel={onboardingCopy.passwordCta}
      pendingLabel={onboardingCopy.passwordPending}
      onSuccess={onDone}
    />
  );
}
