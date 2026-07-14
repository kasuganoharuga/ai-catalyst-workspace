import { createAuthClient } from "better-auth/react";

// No baseURL: the client always calls the same-origin
// /api/auth/[...all] route handler, so this works unchanged across local,
// preview, and production deployments.
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
