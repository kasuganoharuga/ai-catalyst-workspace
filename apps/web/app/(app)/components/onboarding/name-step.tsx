"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { updateProfileAction } from "@/lib/actions/founder-actions";

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
        <Field
          label={onboardingCopy.nameFirstLabel}
          value={firstName}
          onChange={setFirstName}
          autoComplete="given-name"
          placeholder="Alex"
        />
        <Field
          label={onboardingCopy.nameLastLabel}
          value={lastName}
          onChange={setLastName}
          autoComplete="family-name"
          placeholder="Smith"
        />
      </div>

      {error ? (
        <p
          role="alert"
          className="border-l-2 border-destructive bg-destructive/5 py-2 pl-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {/* No skip: both name parts are required, which is also the test the
          dashboard's profile nudge uses, so finishing here retires it. */}
      <Button type="submit" disabled={!canSubmit}>
        {saving ? onboardingCopy.namePending : onboardingCopy.nameCta}
      </Button>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-foreground focus:ring-1 focus:ring-foreground"
      />
    </label>
  );
}
