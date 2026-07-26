"use client";

import { Button } from "@/components/ui/button";

import { workspaceCopy } from "../../lib/copy";
import { useCreateVentureForm } from "../hooks/use-create-venture-form";

export function CreateVentureForm() {
  const {
    name,
    setName,
    oneLiner,
    setOneLiner,
    summary,
    setSummary,
    error,
    isSubmitting,
    handleSubmit,
  } = useCreateVentureForm();

  // Field styling matches profile/components/profile-form.tsx. This form
  // was still on an older set — pill button, 0.2em uppercase labels,
  // rounded-xl inputs — which made the same action look like two products
  // depending on which page you reached it from.
  const inputClass =
    "w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-foreground focus:ring-1 focus:ring-foreground";

  return (
    <div className="mt-8 rounded-xl border border-border bg-card p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Name">
          <input
            type="text"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Investor pipeline for founders"
            className={inputClass}
          />
        </Field>
        <Field label="One-liner (optional)">
          <input
            type="text"
            value={oneLiner}
            onChange={(event) => setOneLiner(event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Summary (optional)">
          <textarea
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            rows={3}
            className={inputClass}
          />
        </Field>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? workspaceCopy.creatingIdea : workspaceCopy.createIdea}
        </Button>
      </form>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="block text-sm text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
