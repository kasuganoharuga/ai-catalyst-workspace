"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";

/**
 * Shared sign-out for UserMenu and /pending's SignOutButton.
 * Ends the browser session only — MCP grants stay alive (Disconnect /
 * password change / lifetime limits / RFC 7009 revoke those).
 */
export function useSignOut(): {
  isSigningOut: boolean;
  signOut: () => Promise<void>;
} {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function signOut(): Promise<void> {
    setIsSigningOut(true);

    try {
      await authClient.signOut({
        fetchOptions: {
          onSuccess: () => {
            router.push("/");
          },
        },
      });
    } finally {
      // Always reset — success may not unmount this trigger before navigate.
      setIsSigningOut(false);
    }
  }

  return { isSigningOut, signOut };
}
