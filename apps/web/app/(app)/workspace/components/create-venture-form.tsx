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
    <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Name">
          <input
            type="text"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm outline-none focus:border-stone-950"
          />
        </Field>
        <Field label="One-liner (optional)">
          <input
            type="text"
            value={oneLiner}
            onChange={(event) => setOneLiner(event.target.value)}
            className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm outline-none focus:border-stone-950"
          />
        </Field>
        <Field label="Summary (optional)">
          <textarea
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            rows={3}
            className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm outline-none focus:border-stone-950"
          />
        </Field>

        {error ? <p className="text-sm text-red-700">{error}</p> : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-full bg-stone-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-amber-800 disabled:opacity-50"
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
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
        {label}
      </span>
      {children}
    </label>
  );
}
