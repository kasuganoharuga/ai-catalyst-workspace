"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { UserProfile } from "@ai-catalyst/shared";

import { Button } from "@/components/ui/button";

type FormState = {
  firstName: string;
  lastName: string;
  contactEmail: string;
  jobTitle: string;
  linkedinUrl: string;
  bio: string;
};

function toFormState(profile: UserProfile): FormState {
  return {
    firstName: profile.firstName ?? "",
    lastName: profile.lastName ?? "",
    contactEmail: profile.contactEmail ?? "",
    jobTitle: profile.jobTitle ?? "",
    linkedinUrl: profile.linkedinUrl ?? "",
    bio: profile.bio ?? "",
  };
}

export function ProfileForm({ profile }: { profile: UserProfile }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => toFormState(profile));
  const [saved, setSaved] = useState<FormState>(() => toFormState(profile));
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  const isDirty = (Object.keys(form) as (keyof FormState)[]).some(
    (key) => form[key] !== saved[key],
  );

  function update(key: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setStatus("idle");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setError(null);

    // Empty strings are sent as null so clearing a field actually clears
    // the column rather than trying to store a blank the DB rejects.
    const payload = Object.fromEntries(
      (Object.keys(form) as (keyof FormState)[]).map((key) => [
        key,
        form[key].trim() === "" ? null : form[key].trim(),
      ]),
    );

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(
          body?.error?.message ?? "That didn't save. Try again in a moment.",
        );
        setStatus("idle");
        return;
      }

      setSaved(form);
      setStatus("saved");
      // The greeting and the sidebar read the same profile, so refresh
      // the server components to keep the whole shell in step.
      router.refresh();
    } catch {
      setError("That didn't save. Try again in a moment.");
      setStatus("idle");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8">
      <fieldset className="border-t border-border">
        <legend className="sr-only">Your details</legend>
        <Field
          label="First name"
          value={form.firstName}
          onChange={(value) => update("firstName", value)}
          autoComplete="given-name"
          placeholder="Sicong"
        />
        <Field
          label="Last name"
          value={form.lastName}
          onChange={(value) => update("lastName", value)}
          autoComplete="family-name"
          placeholder="Fu"
        />
        <Field
          label="Job title"
          value={form.jobTitle}
          onChange={(value) => update("jobTitle", value)}
          autoComplete="organization-title"
          placeholder="Co-founder"
        />
        <Field
          label="Contact email"
          value={form.contactEmail}
          onChange={(value) => update("contactEmail", value)}
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          hint="Only used if someone on the programme needs to reach you — your sign-in email doesn't change."
        />
        <Field
          label="LinkedIn"
          value={form.linkedinUrl}
          onChange={(value) => update("linkedinUrl", value)}
          type="url"
          autoComplete="url"
          placeholder="https://www.linkedin.com/in/you"
        />
        <Field
          label="About you"
          value={form.bio}
          onChange={(value) => update("bio", value)}
          multiline
          placeholder="A couple of lines on your background."
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
        <Button type="submit" disabled={!isDirty || status === "saving"}>
          {status === "saving" ? "Saving…" : "Save changes"}
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  multiline?: boolean;
  placeholder?: string;
  autoComplete?: string;
  hint?: string;
}) {
  const inputClass =
    "w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-foreground focus:ring-1 focus:ring-foreground";

  return (
    <label className="grid gap-2 border-b border-border py-4 sm:grid-cols-[10rem_1fr] sm:items-baseline sm:gap-6">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="min-w-0">
        {multiline ? (
          <textarea
            rows={3}
            value={value}
            placeholder={placeholder}
            onChange={(event) => onChange(event.target.value)}
            className={inputClass}
          />
        ) : (
          <input
            type={type}
            value={value}
            placeholder={placeholder}
            autoComplete={autoComplete}
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
