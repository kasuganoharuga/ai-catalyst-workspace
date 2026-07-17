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

    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-md px-6 py-16">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
          Create an account
        </p>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight">Register</h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          Registration is open for everyone right now. Founder and Mentor access
          is still invitation-only — see the{" "}
          <Link href="/pending" className="underline hover:text-foreground">
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
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none focus:border-foreground focus:ring-2 focus:ring-ring/50"
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
            className="w-full rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:brightness-95 disabled:opacity-50"
          >
            {isSubmitting ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="mt-8 text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/" className="underline hover:text-foreground">
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
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
