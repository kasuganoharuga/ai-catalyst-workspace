import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { resolveFounderPreviewState } from "@ai-catalyst/services/mentor/founder-preview";

import { auth } from "./auth";
import { safeReturnTo } from "./safe-return-to";

/**
 * Route-level role guards — UX routing only, not the security boundary.
 * `assertRole` in packages/services re-checks on every call regardless of which guard ran.
 */

/**
 * Leftover `pending` rows (self-registered before invites provisioned the
 * account) have no destination in the app. End the session so they land on
 * the sign-in page instead of looping.
 */
export async function rejectPendingSession(role: string): Promise<void> {
  if (role !== "pending") return;
  await auth.api.signOut({ headers: await headers() });
  redirect("/");
}

/** @param options.returnTo Same-origin path after sign-in (e.g. consent_code URL). */
export async function requireAuthenticatedUser(options?: {
  returnTo?: string;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    const safeTo = safeReturnTo(options?.returnTo);
    redirect(safeTo ? `/?returnTo=${encodeURIComponent(safeTo)}` : "/");
  }

  return session;
}

export async function requireActiveUser() {
  const session = await requireAuthenticatedUser();
  await rejectPendingSession(session.user.role);
  return session;
}

export async function requireAdminUser() {
  const session = await requireActiveUser();

  if (session.user.role !== "admin") {
    redirect("/dashboard");
  }

  return session;
}

// Mentor-only routes inside (app); Founders use the shell but not these
// pages. A Mentor currently previewing the Founder flow is redirected away
// too — they're immersed in the Founder experience while previewing, and
// exiting is the only way back to these tools (see the exit banner).
export async function requireMentorUser() {
  const session = await requireActiveUser();

  if (session.user.role !== "mentor") {
    redirect("/dashboard");
  }

  const preview = await resolveFounderPreviewState(session.user.id);
  if (preview.previewEnabled) {
    redirect("/dashboard");
  }

  return session;
}

// Founder-only routes; redirects to /dashboard which already branches by
// role. Also lets through a Mentor currently previewing the Founder flow —
// resolveFounderPreviewState is the only source of truth for that, never a
// client-supplied flag.
export async function requireFounderUser() {
  const session = await requireActiveUser();

  if (session.user.role === "founder") {
    return session;
  }

  if (session.user.role === "mentor") {
    const preview = await resolveFounderPreviewState(session.user.id);
    if (preview.previewEnabled) {
      return session;
    }
  }

  redirect("/dashboard");
}

// Shared (app) layout — Founder and Mentor share the shell; each page still calls its own role guard.
export async function requireFounderOrMentorUser() {
  const session = await requireActiveUser();

  if (session.user.role !== "founder" && session.user.role !== "mentor") {
    redirect("/");
  }

  return session;
}
