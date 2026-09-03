import { useState } from "react";

import { authClient } from "@/lib/auth-client";

/** Password sign-in — still the default while Google and email-code are staged behind flags. */
export function usePasswordSignIn({
  email,
  goAfterSignIn,
  setError,
  setIsSubmitting,
}: {
  email: string;
  goAfterSignIn: () => void;
  setError: (message: string | null) => void;
  setIsSubmitting: (value: boolean) => void;
}) {
  const [password, setPassword] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const { error: signInError } = await authClient.signIn.email({
      email,
      password,
    });

    setIsSubmitting(false);

    if (signInError) {
      setError(signInError.message ?? "Sign in failed. Please try again.");
      return;
    }

    goAfterSignIn();
  }

  return { password, setPassword, handleSubmit };
}
