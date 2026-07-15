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
