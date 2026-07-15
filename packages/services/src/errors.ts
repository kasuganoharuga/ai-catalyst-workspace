import type { ActorContext, ActorRole } from "@ai-catalyst/contracts/actor-context";

// Shared business-error shape for every service in this package (not just
// invitation) — apps/web and apps/mcp both map ServiceError.code to their own
// transport-specific response (HTTP status, MCP tool error), so the service
// layer itself never needs to know about either.
export type ServiceErrorCode =
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "INVITATION_ALREADY_PENDING"
  | "INVITATION_NOT_PENDING";

export class ServiceError extends Error {
  constructor(
    public readonly code: ServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export function assertRole(actor: ActorContext, allowed: ActorRole[]): void {
  if (!allowed.includes(actor.role)) {
    throw new ServiceError(
      "FORBIDDEN",
      "You do not have permission to perform this action.",
    );
  }
}
