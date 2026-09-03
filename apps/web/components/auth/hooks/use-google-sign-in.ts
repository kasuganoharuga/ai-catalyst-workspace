import { authClient } from "@/lib/auth-client";

export function useGoogleSignIn({
  returnTo,
  setError,
  setIsSubmitting,
}: {
  returnTo: string | null;
  setError: (message: string | null) => void;
  setIsSubmitting: (value: boolean) => void;
}) {
  async function handleGoogle() {
    setError(null);
    setIsSubmitting(true);
    // No goAfterSignIn() here: this navigates away to Google, and Better Auth
    // brings the browser back to callbackURL itself once the round trip
    // completes. Nothing after this line runs on the happy path.
    const { error: socialError } = await authClient.signIn.social({
      provider: "google",
      callbackURL: returnTo ?? "/dashboard",
    });
    if (socialError) {
      setIsSubmitting(false);
      setError(
        socialError.message ?? "Could not continue with Google. Try again.",
      );
    }
  }

  return { handleGoogle };
}
