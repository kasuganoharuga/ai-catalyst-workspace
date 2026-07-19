"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { CompanyProfile } from "@ai-catalyst/shared";

import { Button } from "@/components/ui/button";
import { updateCompanyProfileAction } from "@/lib/actions/founder-actions";

type FormState = {
  name: string;
  oneLiner: string;
  description: string;
  websiteUrl: string;
  linkedinUrl: string;
  hqCountry: string;
  hqState: string;
  hqCity: string;
  hqStreet: string;
  hqPostalCode: string;
  foundedYear: string;
};

function toFormState(profile: CompanyProfile): FormState {
  return {
    name: profile.name ?? "",
    oneLiner: profile.oneLiner ?? "",
    description: profile.description ?? "",
    websiteUrl: profile.websiteUrl ?? "",
    linkedinUrl: profile.linkedinUrl ?? "",
    hqCountry: profile.hqCountry ?? "",
    hqState: profile.hqState ?? "",
    hqCity: profile.hqCity ?? "",
    hqStreet: profile.hqStreet ?? "",
    hqPostalCode: profile.hqPostalCode ?? "",
    foundedYear:
      profile.foundedYear !== null ? String(profile.foundedYear) : "",
  };
}

export function CompanyProfileForm({ profile }: { profile: CompanyProfile }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(() => toFormState(profile));
  const [saved, setSaved] = useState<FormState>(() => toFormState(profile));
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  const isDirty = (Object.keys(form) as (keyof FormState)[]).some(
    (key) => form[key] !== saved[key],
  );

  const isArchived = profile.status === "archived";
  const saveDisabled =
    isArchived || !isDirty || status === "saving" || isPending;

  function update(key: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setStatus("idle");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setError(null);

    const payload: Record<string, string | number | null> = {};
    for (const key of Object.keys(form) as (keyof FormState)[]) {
      const raw = form[key].trim();
      if (key === "foundedYear") {
        payload.foundedYear = raw === "" ? null : Number(raw);
        continue;
      }
      payload[key] = raw === "" ? null : raw;
    }

    try {
      const result = await updateCompanyProfileAction(payload);

      if (!result.ok) {
        setError(result.message);
        setStatus("idle");
        return;
      }

      setSaved(form);
      setStatus("saved");
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError("That didn't save. Try again in a moment.");
      setStatus("idle");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8">
      {isArchived ? (
        <p className="mb-6 border-l-2 border-muted-foreground/40 bg-muted/40 py-2 pl-3 text-sm leading-6 text-muted-foreground">
          This company profile is archived and can no longer be edited.
        </p>
      ) : null}

      <fieldset className="border-t border-border" disabled={isArchived}>
        <legend className="sr-only">Company details</legend>
        <Field
          label="Company name"
          value={form.name}
          onChange={(value) => update("name", value)}
          autoComplete="organization"
          placeholder="Acme Pty Ltd"
          required={!profile.id}
        />
        <Field
          label="One-liner"
          value={form.oneLiner}
          onChange={(value) => update("oneLiner", value)}
          placeholder="What you do in one sentence."
        />
        <Field
          label="Description"
          value={form.description}
          onChange={(value) => update("description", value)}
          multiline
          placeholder="A short overview of the company, product, and market."
        />
        <Field
          label="Website"
          value={form.websiteUrl}
          onChange={(value) => update("websiteUrl", value)}
          type="url"
          autoComplete="url"
          placeholder="https://example.com"
        />
        <Field
          label="LinkedIn"
          value={form.linkedinUrl}
          onChange={(value) => update("linkedinUrl", value)}
          type="url"
          autoComplete="url"
          placeholder="https://www.linkedin.com/company/example"
        />
        <Field
          label="Country"
          value={form.hqCountry}
          onChange={(value) => update("hqCountry", value.toUpperCase())}
          autoComplete="country"
          placeholder="AU"
          hint="Two-letter code, e.g. AU for Australia."
        />
        <Field
          label="State or region"
          value={form.hqState}
          onChange={(value) => update("hqState", value)}
          autoComplete="address-level1"
          placeholder="NSW"
        />
        <Field
          label="City"
          value={form.hqCity}
          onChange={(value) => update("hqCity", value)}
          autoComplete="address-level2"
          placeholder="Sydney"
        />
        <Field
          label="Street address"
          value={form.hqStreet}
          onChange={(value) => update("hqStreet", value)}
          autoComplete="street-address"
          placeholder="1 Market St"
        />
        <Field
          label="Postcode"
          value={form.hqPostalCode}
          onChange={(value) => update("hqPostalCode", value)}
          autoComplete="postal-code"
          placeholder="2000"
        />
        <Field
          label="Year founded"
          value={form.foundedYear}
          onChange={(value) => update("foundedYear", value.replace(/\D/g, ""))}
          inputMode="numeric"
          placeholder="2024"
        />
      </fieldset>

      {error ? (
        <p
          role="alert"
          className="mt-5 border-l-2 border-destructive bg-destructive/5 py-2 pl-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex items-center gap-4">
        <Button type="submit" disabled={saveDisabled}>
          {status === "saving" || isPending ? "Saving…" : "Save changes"}
        </Button>
        {status === "saved" && !isDirty ? (
          <span className="text-sm text-muted-foreground">Saved</span>
        ) : null}
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  multiline,
  placeholder,
  autoComplete,
  hint,
  required,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  multiline?: boolean;
  placeholder?: string;
  autoComplete?: string;
  hint?: string;
  required?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  const inputClass =
    "w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-foreground focus:ring-1 focus:ring-foreground";

  return (
    <label className="grid gap-2 border-b border-border py-4 sm:grid-cols-[10rem_1fr] sm:items-baseline sm:gap-6">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="min-w-0">
        {multiline ? (
          <textarea
            rows={4}
            value={value}
            placeholder={placeholder}
            required={required}
            onChange={(event) => onChange(event.target.value)}
            className={inputClass}
          />
        ) : (
          <input
            type={type}
            value={value}
            placeholder={placeholder}
            autoComplete={autoComplete}
            required={required}
            inputMode={inputMode}
            onChange={(event) => onChange(event.target.value)}
            className={inputClass}
          />
        )}
        {hint ? (
          <span className="mt-1.5 block text-xs leading-5 text-muted-foreground">
            {hint}
          </span>
        ) : null}
      </span>
    </label>
  );
}
