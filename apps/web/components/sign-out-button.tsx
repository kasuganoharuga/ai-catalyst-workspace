"use client";

import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() =>
        authClient.signOut({
          fetchOptions: {
            onSuccess: () => router.push("/"),
          },
        })
      }
      className="rounded-full border border-border px-6 py-3 text-sm font-semibold text-foreground transition hover:border-foreground"
    >
      Sign out
    </button>
  );
}
