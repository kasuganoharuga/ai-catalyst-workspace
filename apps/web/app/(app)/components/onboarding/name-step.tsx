"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/error-banner";
import { TextField } from "@/components/text-field";
import { updateProfileAction } from "@/lib/actions/account-actions";

import { errorCopy, onboardingCopy } from "../../lib/copy";

/**
 * Only the two name parts. `updateProfileAction` leaves any field it isn't
 * given alone, so sending just these cannot disturb a profile that already
 * has contact details on it.
 */
export function NameStep({ onDone }: { onDone: () => void }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    firstName.trim().length > 0 && lastName.trim().length > 0 && !saving;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const result = await updateProfileAction({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      if (!result.ok) {
        setError(result.message);
        setSaving(false);
        return;
      }
      onDone();
    } catch {
      setError(errorCopy.generic);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label={onboardingCopy.nameFirstLabel}
          value={firstName}
          onChange={setFirstName}
          autoComplete="given-name"
          placeholder="Alex"
        />
        <TextField
          label={onboardingCopy.nameLastLabel}
          value={lastName}
          onChange={setLastName}
          autoComplete="family-name"
          placeholder="Smith"
        />
      </div>

      {error ? <ErrorBanner>{error}</ErrorBanner> : null}

      {/* No skip: both name parts are required, which is also the test the
          dashboard's profile nudge uses, so finishing here retires it. */}
      <Button type="submit" disabled={!canSubmit}>
        {saving ? onboardingCopy.namePending : onboardingCopy.nameCta}
      </Button>
    </form>
  );
}
