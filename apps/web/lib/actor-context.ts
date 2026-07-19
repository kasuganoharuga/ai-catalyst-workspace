import type {
  ActorContext,
  ActorRole,
} from "@ai-catalyst/contracts/actor-context";
import { createWebActorContext } from "@ai-catalyst/contracts/actor-context";
import { ServiceError } from "@ai-catalyst/services/errors";

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

  return createWebActorContext({
    userId: session.user.id,
    role: session.user.role,
  });
}
