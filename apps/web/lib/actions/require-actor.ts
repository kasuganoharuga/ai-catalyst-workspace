import { headers } from "next/headers";

import type {
  ActorContext,
  ActorRole,
} from "@ai-catalyst/contracts/actor-context";
import { effectiveRole } from "@ai-catalyst/contracts/actor-context";
import { ServiceError } from "@ai-catalyst/services/errors";

import {
  actorContextFromSession,
  actorContextFromSessionWithPreview,
} from "@/lib/actor-context";
import { auth } from "@/lib/auth";

/**
 * The membership check every require*Actor wrapper shares, pulled out on
 * its own so it's testable without stubbing a Better Auth session (see
 * apps/web/tests/action-shell.test.ts). Note what this predicate alone
 * cannot show: a Mentor actor built with `actingAs: "founder"` set fails
 * `isActorAllowed(actor, ["mentor"])`, because effectiveRole reads
 * "founder" — which is exactly why requireRealMentorActor doesn't reach
 * for this check against a preview-aware actor. It instead asks
 * requireActorContext for a `previewAware: false` actor, one that never
 * has actingAs set at all, so effectiveRole falls through to the real
 * "mentor" regardless of whether that Mentor is currently previewing.
 */
export function isActorAllowed(
  actor: ActorContext,
  roles: readonly ActorRole[],
): boolean {
  return roles.includes(effectiveRole(actor));
}

/**
 * The one session -> role-check -> ActorContext shape all of lib/actions/
 * used to reimplement independently. `previewAware` picks which builder in
 * actor-context.ts runs; either way, isActorAllowed is what gets checked —
 * for a plain (non-preview) actor, actingAs is never set, so effectiveRole
 * is just actor.role, making this identical to a raw role check whenever
 * `previewAware` is false.
 */
async function requireActorContext(options: {
  roles: readonly ActorRole[];
  previewAware: boolean;
  forbiddenMessage: string;
}): Promise<ActorContext> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    throw new ServiceError("UNAUTHENTICATED", "Sign in required.");
  }
  const actor = options.previewAware
    ? await actorContextFromSessionWithPreview(session)
    : actorContextFromSession(session);
  if (!isActorAllowed(actor, options.roles)) {
    throw new ServiceError("FORBIDDEN", options.forbiddenMessage);
  }
  return actor;
}

/**
 * effectiveRole, not actor.role: lets a Mentor previewing the Founder
 * flow through, scoped to their own sandbox exactly as a real Founder
 * would be (every service call downstream re-resolves scope from
 * actor.userId).
 */
export function requireFounderActor(): Promise<ActorContext> {
  return requireActorContext({
    roles: ["founder"],
    previewAware: true,
    forbiddenMessage: "Founder access required.",
  });
}

/**
 * Profile + password are shared across Founder, Mentor, and Admin —
 * packages/services/profile already allows all three
 * (assertRole(actor, ["founder", "mentor", "admin"])); this only decides
 * who may reach it from a request. Anything that stays Founder-only (the
 * AI assistant choice, MCP revocation) goes through requireFounderActor
 * instead.
 */
export function requireAccountActor(): Promise<ActorContext> {
  return requireActorContext({
    roles: ["founder", "mentor", "admin"],
    previewAware: true,
    forbiddenMessage: "Founder, mentor, or admin access required.",
  });
}

/**
 * Founder or Mentor, preview-aware: a Mentor walking the Founder flow in
 * their own sandbox (actingAs: "founder") reaches this the same way a real
 * Founder does — see artifact-comment/index.ts's
 * assertActorCanAccessWorkspace.
 */
export function requireCommentActor(): Promise<ActorContext> {
  return requireActorContext({
    roles: ["founder", "mentor"],
    previewAware: true,
    forbiddenMessage: "Founder or Mentor access required.",
  });
}

export function requireAdminActor(): Promise<ActorContext> {
  return requireActorContext({
    roles: ["admin"],
    previewAware: false,
    forbiddenMessage: "Admin access required.",
  });
}

/**
 * Not preview-aware — a Mentor's invitation scope (invited_by_user_id) is
 * enforced service-side, not here, and there is no Founder-preview concept
 * for inviting Founders in the first place.
 */
export function requireMentorActor(): Promise<ActorContext> {
  return requireActorContext({
    roles: ["mentor"],
    previewAware: false,
    forbiddenMessage: "Mentor access required.",
  });
}

/**
 * Deliberately not preview-aware, unlike requireMentorActor above despite
 * having the identical implementation today — the distinction is the
 * point, not an accident, which is why this gets its own name rather than
 * being folded into requireMentorActor. These actions manage the preview
 * overlay itself (entering/exiting preview, starting or restarting a
 * sandbox), so they must always see the Mentor's real identity, the same
 * way packages/services/src/mentor/founder-preview.ts's assertRealMentor
 * does. Making this preview-aware would break exitFounderPreviewAction: it
 * has to succeed *while* previewing, which an effectiveRole-based check
 * would reject (effectiveRole would read "founder", not "mentor").
 */
export function requireRealMentorActor(): Promise<ActorContext> {
  return requireActorContext({
    roles: ["mentor"],
    previewAware: false,
    forbiddenMessage: "Mentor access required.",
  });
}
