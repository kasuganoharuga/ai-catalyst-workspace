import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// No baseURL: the client always calls the same-origin
// /api/auth/[...all] route handler, so this works unchanged across local,
// preview, and production deployments.
//
// emailOTPClient is registered unconditionally, unlike its server counterpart
// in lib/auth.ts. It only adds typed methods that call `/sign-in/email-otp`;
// registering it while AUTH_EMAIL_OTP_ENABLED is false adds no UI and issues no
// requests, and keeping it out of the flag avoids a second place where the flag
// could drift out of step. The UI is what the flag actually gates.
export const authClient = createAuthClient({
  plugins: [emailOTPClient()],
});

export const { signIn, signUp, signOut, useSession, emailOtp } = authClient;
