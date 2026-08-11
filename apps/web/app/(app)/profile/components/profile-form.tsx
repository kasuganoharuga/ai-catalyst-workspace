"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { UserProfile } from "@ai-catalyst/shared";

import { toastCopy } from "@/app/(app)/lib/copy";
import { Button } from "@/components/ui/button";
import { updateProfileAction } from "@/lib/actions/account-actions";
import { firstZodMessage } from "@/lib/validation/common";
import { updateProfileInputSchema } from "@/lib/validation/profile";
import { cn } from "@/lib/utils";

// `bio` is deliberately absent: the field was removed from the form, and
// leaving it here would send an empty string on every save and quietly
// wipe whatever an existing founder had written.
type FormState = {
  firstName: string;
  lastName: string;
  contactEmail: string;
  jobTitle: string;
  linkedinUrl: string;
};

function toFormState(profile: UserProfile): FormState {
  return {
    firstName: profile.firstName ?? "",
    lastName: profile.lastName ?? "",
    contactEmail: profile.contactEmail ?? "",
    jobTitle: profile.jobTitle ?? "",
    linkedinUrl: profile.linkedinUrl ?? "",
  };
}

export function ProfileForm({ profile }: { profile: UserProfile }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
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
    if (error) setError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    // Empty strings are sent as null so clearing a field actually clears
    // the column rather than trying to store a blank the DB rejects.
    const payload = Object.fromEntries(
      (Object.keys(form) as (keyof FormState)[]).map((key) => [
        key,
        form[key].trim() === "" ? null : form[key].trim(),
      ]),
    );

    const parsed = updateProfileInputSchema.safeParse(payload);
    if (!parsed.success) {
      const message = firstZodMessage(parsed.error);
      setError(message);
      toast.error(toastCopy.actionFailedTitle, { description: message });
      return;
    }

    setStatus("saving");

    try {
      const result = await updateProfileAction(parsed.data);

      if (!result.ok) {
        setError(result.message);
        setStatus("idle");
        toast.error(toastCopy.actionFailedTitle, {
          description: result.message,
        });
        return;
      }

      setSaved(form);
      setStatus("saved");
      toast.success(toastCopy.profileSaved);
      startTransition(() => {
        router.refresh();
      });
    } catch {
      const message = "That didn't save. Try again in a moment.";
      setError(message);
      setStatus("idle");
      toast.error(toastCopy.actionFailedTitle, { description: message });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 max-w-2xl" noValidate>
      <fieldset className="grid gap-5 border-t border-border pt-6 sm:grid-cols-2">
        <legend className="sr-only">Your details</legend>
        <Field
          label="First name"
          value={form.firstName}
          onChange={(value) => update("firstName", value)}
          autoComplete="given-name"
          placeholder="Alex"
        />
        <Field
          label="Last name"
          value={form.lastName}
          onChange={(value) => update("lastName", value)}
          autoComplete="family-name"
          placeholder="Smith"
        />
        <Field
          label="Job title"
          value={form.jobTitle}
          onChange={(value) => update("jobTitle", value)}
          autoComplete="organization-title"
          placeholder="Co-founder"
          className="sm:col-span-2"
        />
        <Field
          label="Contact email"
          value={form.contactEmail}
          onChange={(value) => update("contactEmail", value)}
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          hint="Only used if someone on the program needs to reach you. Your sign-in email doesn't change."
          className="sm:col-span-2"
        />
        <Field
          label="LinkedIn"
          value={form.linkedinUrl}
          onChange={(value) => update("linkedinUrl", value)}
          type="url"
          autoComplete="url"
          placeholder="https://www.linkedin.com/in/you"
          className="sm:col-span-2"
        />
        {/* "About you" is gone: a free-text bio is a paragraph nobody
            reads and nothing in the toolkit uses. The company web page it
            was meant to become lives on Company profile instead, next to
            the company name its first save requires. */}
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
        <Button
          type="submit"
          disabled={!isDirty || status === "saving" || isPending}
        >
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
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  multiline?: boolean;
  placeholder?: string;
  autoComplete?: string;
  hint?: string;
  className?: string;
}) {
  const inputClass =
    "w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-foreground focus:ring-1 focus:ring-foreground";

  return (
    <label className={cn("block space-y-2", className)}>
      <span className="text-sm text-muted-foreground">{label}</span>
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
        <span className="block text-xs leading-5 text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </label>
  );
}
