import { randomUUID } from "node:crypto";

import type {
  ActorContext,
  ActorRole,
} from "@ai-catalyst/contracts/actor-context";
import { createWebActorContext } from "@ai-catalyst/contracts/actor-context";
import { ServiceError } from "@ai-catalyst/services/errors";
import { resolveFounderPreviewState } from "@ai-catalyst/services/mentor/founder-preview";

// Better Auth's session type widens `additionalFields.role` to `string`
// rather than the literal ActorRole union, so this cannot be a plain
// `as ActorRole` cast — an unrecognized value must be treated as
// unauthorized, not silently trusted.
function isActorRole(value: unknown): value is ActorRole {
  return (
    value === "pending" ||
    value === "founder" ||
    value === "mentor" ||
    value === "admin"
  );
}

export function actorContextFromSession(session: {
  user: { id: string; role: unknown };
}): ActorContext {
  if (!isActorRole(session.user.role)) {
    throw new ServiceError("FORBIDDEN", "Unrecognized account role.");
  }

  // One correlation pair per server action / RSC call into services.
  const correlationId = randomUUID();
  return createWebActorContext({
    userId: session.user.id,
    role: session.user.role,
    traceId: correlationId,
    requestId: correlationId,
  });
}

/**
 * Same as actorContextFromSession, plus `actingAs: "founder"` when this is
 * a Mentor currently previewing the Founder flow (see
 * packages/services/src/mentor/founder-preview.ts). This is the one place
 * that DB check happens for a web request — every page/action that needs a
 * Founder-or-previewing-Mentor actor should build it here rather than
 * re-deriving actingAs itself. Never trust actingAs from anywhere else;
 * this always re-reads current DB state.
 */
export async function actorContextFromSessionWithPreview(session: {
  user: { id: string; role: unknown };
}): Promise<ActorContext> {
  const actor = actorContextFromSession(session);
  if (actor.role !== "mentor") {
    return actor;
  }

  const preview = await resolveFounderPreviewState(actor.userId);
  return preview.previewEnabled
    ? { ...actor, actingAs: "founder" as const }
    : actor;
}
