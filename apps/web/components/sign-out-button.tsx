"use client";

import { useSignOut } from "@/lib/use-sign-out";

/** Sign-out for /pending (outside the app shell; cannot use UserMenu). */
export function SignOutButton() {
  const { isSigningOut, signOut } = useSignOut();

  return (
    <button
      type="button"
      onClick={() => void signOut()}
      disabled={isSigningOut}
      className="rounded-full border border-border px-6 py-3 text-sm font-semibold text-foreground transition hover:border-foreground disabled:opacity-50"
    >
      {isSigningOut ? "Signing out…" : "Sign out"}
    </button>
  );
}
