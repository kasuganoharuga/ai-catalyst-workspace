import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { safeReturnTo } from "./safe-return-to";

/**
 * Registration is temporarily public (see auth.ts) with no invitation
 * gating yet, so every new user starts and stays at role 'pending' until
 * invitation acceptance (packages/services/src/invitation) ships. These
 * helpers are the interim guard that keeps `/workspace` and `/admin`
 * unreachable in the meantime, without hard-coding that logic into every
 * page. Remove/relax once invitation acceptance is implemented.
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

// Guards the pages under (app) that are Mentor-exclusive — Founders list
// detail, an individual Founder's artefact, and Mentor invitations. A
// Founder is welcome inside the (app) shell generally (see
// requireFounderOrMentorUser below), just not on these specific routes.
export async function requireMentorUser() {
  const session = await requireActiveUser();

  if (session.user.role !== "mentor") {
    redirect("/dashboard");
  }

  return session;
}

// Guards pages that are Founder-exclusive even though a Mentor may be
// signed in and inside the shared (app) shell generally — Modules,
// Artefacts, Company profile, AI connection, the Workspace page, and
// /dashboard's own Founder branch all call this themselves. Redirects to
// /dashboard rather than "/": that route already renders the right thing
// for whichever role actually landed here, without a second hop through
// HomePage's ROLE_DESTINATION.
export async function requireFounderUser() {
  const session = await requireActiveUser();

  if (session.user.role !== "founder") {
    redirect("/dashboard");
  }

  return session;
}

// Guards the (app) layout itself. Founder and Mentor share this shell —
// same sidebar chrome, different nav items and different content behind
// /dashboard (see app/(app)/dashboard/page.tsx's own role branch) — so this
// is deliberately more permissive than requireFounderUser. It is not,
// however, the security boundary for any individual page: every
// Founder-exclusive route inside (app) still calls requireFounderUser (via
// getCurrentFounderActor) itself, and every Mentor-exclusive one calls
// requireMentorUser, regardless of what this layout-level guard allowed
// through.
export async function requireFounderOrMentorUser() {
  const session = await requireActiveUser();

  if (session.user.role !== "founder" && session.user.role !== "mentor") {
    redirect("/");
  }

  return session;
}
