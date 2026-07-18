import type { ActorContext, ActorRole } from "@ai-catalyst/contracts/actor-context";

// Shared business-error shape for every service in this package (not just
// invitation) — apps/web and apps/mcp both map ServiceError.code to their own
// transport-specific response (HTTP status, MCP tool error), so the service
// layer itself never needs to know about either.
export type ServiceErrorCode =
  | "FORBIDDEN"
  // The caller presented no credential, or one that no longer identifies a
  // usable subject (expired/invalid Bearer token, disabled OAuth client, a
  // deleted user) — as opposed to FORBIDDEN, where the subject is valid but
  // not allowed to do this. apps/web maps this to HTTP 401; apps/mcp's
  // Bearer-verification middleware maps it to 401 with a `WWW-Authenticate`
  // challenge (packages/services/src/mcp-auth).
  | "UNAUTHENTICATED"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "INVITATION_ALREADY_PENDING"
  | "INVITATION_NOT_PENDING"
  | "INVITATION_EMAIL_MISMATCH"
  | "FOUNDER_WORKSPACE_ALREADY_EXISTS"
  // PR 2.4 (packages/services/src/attempt) — all five are state-conflict
  // errors (HTTP 409 in apps/web/lib/service-error-response.ts), not
  // validation errors: the request is well-formed, but the target
  // Attempt/run_module is not in a state that permits the operation.
  | "RUN_MODULE_NOT_AVAILABLE"
  | "ATTEMPT_PENDING_REVIEW"
  | "ATTEMPT_NOT_EDITABLE"
  | "ATTEMPT_NOT_SUBMITTABLE"
  | "ATTEMPT_RETRY_SOURCE_INVALID"
  // A server-side content/data invariant was violated (e.g. a published
  // Program Version has zero active Modules) — never the caller's fault,
  // so callers should treat this as an unexpected failure rather than a
  // normal business error to recover from.
  | "INTERNAL_INVARIANT_ERROR";

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
