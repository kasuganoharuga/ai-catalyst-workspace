import type {
  ActorContext,
  ActorRole,
} from "@ai-catalyst/contracts/actor-context";

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
  // Attempt/run_module state conflicts (HTTP 409): the request is
  // well-formed but the target is not in a state that permits the operation.
  | "RUN_MODULE_NOT_AVAILABLE"
  // confirmModuleCompletion was called against a Module with nothing to
  // confirm — no Attempt at all, or one that hasn't passed its official
  // validation yet. A state conflict (HTTP 409), same family as the
  // ATTEMPT_* codes: the request is well-formed, the Module just isn't
  // there yet.
  | "MODULE_NOT_READY_FOR_CONFIRMATION"
  | "ATTEMPT_PENDING_REVIEW"
  | "ATTEMPT_NOT_EDITABLE"
  | "ATTEMPT_NOT_SUBMITTABLE"
  | "ATTEMPT_RETRY_SOURCE_INVALID"
  // A server-side content/data invariant was violated (e.g. a published
  // Program Version has zero active Modules) — never the caller's fault,
  // so callers should treat this as an unexpected failure rather than a
  // normal business error to recover from.
  | "INTERNAL_INVARIANT_ERROR"
  // storage_objects.upload_status is 'verified' (or any prior state that
  // already recorded a checksum) with a different sha256 than the new
  // content — a verified object is immutable; a genuinely new version must
  // go through a new createPendingGeneratedObject call, not overwrite this
  // storageObjectId.
  | "STORAGE_CONTENT_CONFLICT"
  // storage_objects.upload_status is 'failed' or 'deleted' — writing to a
  // dead row is refused rather than resurrecting it; the caller must
  // request a fresh storageObjectId via createPendingGeneratedObject.
  | "STORAGE_OBJECT_NOT_WRITABLE"
  // deleteUnverifiedUpload was called against a 'verified' storage_objects
  // row — lifecycle management of a verified object is out of scope for
  // this "clean up an unfinished upload" API.
  | "STORAGE_OBJECT_NOT_DELETABLE"
  // Artifact submission/validation state conflicts (HTTP 409).
  // errors (HTTP 409), matching the ATTEMPT_* codes above.
  //
  // An Artifact Definition's `validator_key` is null/unregistered but a
  // check was requested against it anyway — a content/deployment
  // mismatch, never the caller's fault at the request level, but still
  // surfaced as a state conflict rather than INTERNAL_INVARIANT_ERROR
  // because runDraftCheck's caller (a Founder) can be told to wait for
  // content to catch up rather than treating it as a 500.
  | "VALIDATOR_NOT_CONFIGURED"
  // runOfficialValidation was called against an Attempt whose status is
  // not 'submitted' — either it was never submitted, or it already has
  // an official validation outcome (ready_for_review/validation_failed
  // short-circuit instead of reaching this error; see runOfficialValidation's
  // own comment for why those two are idempotent rather than errors).
  | "ATTEMPT_NOT_AWAITING_VALIDATION";

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
