import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { safeReturnTo } from "./safe-return-to";

/**
 * Route-level role guards — UX routing only, not the security boundary.
 * `assertRole` in packages/services re-checks on every call regardless of which guard ran.
 */

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

  if (session.user.role === "pending") {
    redirect("/pending");
  }

  return session;
}

export async function requireAdminUser() {
  const session = await requireActiveUser();

  if (session.user.role !== "admin") {
    redirect("/dashboard");
  }

  return session;
}

// Mentor-only routes inside (app); Founders use the shell but not these pages.
export async function requireMentorUser() {
  const session = await requireActiveUser();

  if (session.user.role !== "mentor") {
    redirect("/dashboard");
  }

  return session;
}

// Founder-only routes; redirects to /dashboard which already branches by role.
export async function requireFounderUser() {
  const session = await requireActiveUser();

  if (session.user.role !== "founder") {
    redirect("/dashboard");
  }

  return session;
}

// Shared (app) layout — Founder and Mentor share the shell; each page still calls its own role guard.
export async function requireFounderOrMentorUser() {
  const session = await requireActiveUser();

  if (session.user.role !== "founder" && session.user.role !== "mentor") {
    redirect("/");
  }

  return session;
}
