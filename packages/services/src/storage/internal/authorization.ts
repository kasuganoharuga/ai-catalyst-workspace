import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { effectiveRole } from "@ai-catalyst/contracts/actor-context";

import { ServiceError } from "@ai-catalyst/services/errors";

// Founders pass on `role`; trusted system callers pass on `source`.
// `"system"` is an ActorSource, not an ActorRole, so this cannot be
// expressed as assertRole(["founder", "system"]).
//
// effectiveRole, not actor.role: a Mentor previewing the Founder flow must
// be able to write into their own sandbox the same way they can already
// read it back (see generated-text.ts's getGeneratedTextContent) —
// their `role` stays "mentor" throughout, only `actingAs` flips to
// "founder", and every write here still resolves scope via
// resolveFounderWorkspace(actor), which for a previewing Mentor only ever
// resolves to their own sandbox.
export function assertFounderOrSystemActor(actor: ActorContext): void {
  if (effectiveRole(actor) === "founder" || actor.source === "system") {
    return;
  }
  throw new ServiceError(
    "FORBIDDEN",
    "You do not have permission to perform this action.",
  );
}

// Read gate: founder/mentor/admin/system; writes stay founder/system-only.
export function assertGeneratedContentReader(actor: ActorContext): void {
  if (
    actor.role === "founder" ||
    actor.role === "mentor" ||
    actor.role === "admin" ||
    actor.source === "system"
  ) {
    return;
  }
  throw new ServiceError(
    "FORBIDDEN",
    "You do not have permission to perform this action.",
  );
}
