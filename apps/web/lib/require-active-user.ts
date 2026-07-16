import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

/**
 * Registration is temporarily public (see auth.ts) with no invitation
 * gating yet, so every new user starts and stays at role 'pending' until
 * invitation acceptance (packages/services/src/invitation) ships. These
 * helpers are the interim guard that keeps `/workspace` and `/admin`
 * unreachable in the meantime, without hard-coding that logic into every
 * page. Remove/relax once invitation acceptance is implemented.
 */

export async function requireAuthenticatedUser() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
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
    redirect("/workspace");
  }

  return session;
}

// Mentor/Admin have no Venture-management UI yet (Mentor Workspace binding
// is PR 4.1; Admin has its own /admin surface) — the Workspace page is
// Founder-only for now.
export async function requireFounderUser() {
  const session = await requireActiveUser();

  // Redirects to /toolkit, not /workspace — /workspace itself calls this
  // guard, so redirecting back to it would loop.
  if (session.user.role !== "founder") {
    redirect("/toolkit");
  }

  return session;
}
