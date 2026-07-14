"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { SiteHeader } from "@/components/site-header";
import { authClient } from "@/lib/auth-client";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const { error: signUpError } = await authClient.signUp.email({
      // `name` always starts equal to `email` (enforced server-side in
      // lib/auth.ts's databaseHooks regardless of what's sent here) — there
      // is no separate display-name field at signup.
      name: email,
      email,
      password,
    });

    setIsSubmitting(false);

    if (signUpError) {
      setError(signUpError.message ?? "Registration failed. Please try again.");
      return;
    }

    router.push("/workspace");
  }

  return (
    <div className="min-h-screen bg-stone-100 text-stone-950">
      <SiteHeader />
      <main className="mx-auto max-w-md px-6 py-16">
        <p className="text-sm font-semibold uppercase tracking-[0.34em] text-amber-700">
          Create an account
        </p>
        <h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em]">
          Register
        </h1>
        <p className="mt-4 text-sm leading-6 text-stone-700">
          Registration is open for everyone right now. Founder and Mentor access
          is still invitation-only — see the{" "}
          <Link href="/pending" className="underline hover:text-stone-950">
            pending
          </Link>{" "}
          state after signing up.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <Field label="Email">
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm outline-none focus:border-stone-950"
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm outline-none focus:border-stone-950"
            />
          </Field>

          {error ? <p className="text-sm text-red-700">{error}</p> : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-full bg-stone-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-amber-800 disabled:opacity-50"
          >
            {isSubmitting ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="mt-8 text-sm text-stone-700">
          Already have an account?{" "}
          <Link href="/login" className="underline hover:text-stone-950">
            Sign in
          </Link>
        </p>
      </main>
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
