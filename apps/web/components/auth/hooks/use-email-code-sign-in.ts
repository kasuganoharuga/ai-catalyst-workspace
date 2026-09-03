import { useState } from "react";

import { authClient } from "@/lib/auth-client";

/** Send and verify are one state machine — sending a code is what puts the form into verify mode. */
export function useEmailCodeSignIn({
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
  // Non-null once a code has been sent: swaps the email field for code entry.
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");

  async function handleSendCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const { error: sendError } = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: "sign-in",
    });

    setIsSubmitting(false);

    if (sendError) {
      setError(sendError.message ?? "Could not send a code. Try again.");
      return;
    }
    setCodeSentTo(email);
  }

  async function handleVerifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const { error: verifyError } = await authClient.signIn.emailOtp({
      email: codeSentTo ?? email,
      otp: code,
    });

    setIsSubmitting(false);

    if (verifyError) {
      setError(
        verifyError.message ?? "That code didn't work. Check it and try again.",
      );
      return;
    }

    goAfterSignIn();
  }

  return {
    codeSentTo,
    setCodeSentTo,
    code,
    setCode,
    handleSendCode,
    handleVerifyCode,
  };
}
