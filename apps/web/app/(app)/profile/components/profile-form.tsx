"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { UserProfile } from "@ai-catalyst/shared";

import { toastCopy } from "@/app/(app)/lib/copy";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/error-banner";
import { SavedNote } from "@/components/saved-note";
import { TextField } from "@/components/text-field";
import { useSaveStatus } from "@/hooks/use-save-status";
import { updateProfileAction } from "@/lib/actions/account-actions";
import { firstZodMessage } from "@/lib/validation/common";
import { updateProfileInputSchema } from "@/lib/validation/profile";

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
  const {
    status,
    setIdle,
    setSaving,
    setSaved: setSavedStatus,
  } = useSaveStatus();
  const [error, setError] = useState<string | null>(null);

  const isDirty = (Object.keys(form) as (keyof FormState)[]).some(
    (key) => form[key] !== saved[key],
  );

  function update(key: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setIdle();
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

    setSaving();

    try {
      const result = await updateProfileAction(parsed.data);

      if (!result.ok) {
        setError(result.message);
        setIdle();
        toast.error(toastCopy.actionFailedTitle, {
          description: result.message,
        });
        return;
      }

      setSaved(form);
      setSavedStatus();
      toast.success(toastCopy.profileSaved);
      startTransition(() => {
        router.refresh();
      });
    } catch {
      const message = "That didn't save. Try again in a moment.";
      setError(message);
      setIdle();
      toast.error(toastCopy.actionFailedTitle, { description: message });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 max-w-2xl" noValidate>
      <fieldset className="grid gap-5 border-t border-border pt-6 sm:grid-cols-2">
        <legend className="sr-only">Your details</legend>
        <TextField
          label="First name"
          value={form.firstName}
          onChange={(value) => update("firstName", value)}
          autoComplete="given-name"
          placeholder="Alex"
        />
        <TextField
          label="Last name"
          value={form.lastName}
          onChange={(value) => update("lastName", value)}
          autoComplete="family-name"
          placeholder="Smith"
        />
        <TextField
          label="Job title"
          value={form.jobTitle}
          onChange={(value) => update("jobTitle", value)}
          autoComplete="organization-title"
          placeholder="Co-founder"
          className="sm:col-span-2"
        />
        <TextField
          label="Contact email"
          value={form.contactEmail}
          onChange={(value) => update("contactEmail", value)}
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          hint="Only used if someone on the program needs to reach you. Your sign-in email doesn't change."
          className="sm:col-span-2"
        />
        <TextField
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

      {error ? <ErrorBanner className="mt-5">{error}</ErrorBanner> : null}

      <div className="mt-6 flex items-center gap-4">
        <Button
          type="submit"
          disabled={!isDirty || status === "saving" || isPending}
        >
          {status === "saving" || isPending ? "Saving…" : "Save changes"}
        </Button>
        {status === "saved" && !isDirty ? <SavedNote>Saved</SavedNote> : null}
      </div>
    </form>
  );
}
