"use client";

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

  return (
    <div className="mt-8 rounded-2xl border border-border bg-card p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Name">
          <input
            type="text"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none focus:border-foreground focus:ring-2 focus:ring-ring/50"
          />
        </Field>
        <Field label="One-liner (optional)">
          <input
            type="text"
            value={oneLiner}
            onChange={(event) => setOneLiner(event.target.value)}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none focus:border-foreground focus:ring-2 focus:ring-ring/50"
          />
        </Field>
        <Field label="Summary (optional)">
          <textarea
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            rows={3}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none focus:border-foreground focus:ring-2 focus:ring-ring/50"
          />
        </Field>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:brightness-95 disabled:opacity-50"
        >
          {isSubmitting ? "Creating Venture..." : "Create Venture"}
        </button>
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
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
