import type {
  ActorContext,
  ActorRole,
} from "@ai-catalyst/contracts/actor-context";

// Typed business errors — apps/web and apps/mcp map code to HTTP/MCP responses.
export type ServiceErrorCode =
  | "FORBIDDEN" // Valid subject, not allowed (403).
  | "UNAUTHENTICATED" // Missing/invalid credential (401 + MCP WWW-Authenticate).
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "INVITATION_ALREADY_PENDING"
  | "INVITATION_NOT_PENDING"
  | "INVITATION_EMAIL_MISMATCH"
  | "FOUNDER_WORKSPACE_ALREADY_EXISTS"
  | "RUN_MODULE_NOT_AVAILABLE" // Attempt/run_module state conflict (409).
  | "MODULE_NOT_READY_FOR_CONFIRMATION"
  | "ATTEMPT_PENDING_REVIEW"
  | "ATTEMPT_NOT_EDITABLE"
  | "ATTEMPT_NOT_SUBMITTABLE"
  | "ATTEMPT_RETRY_SOURCE_INVALID"
  | "INTERNAL_INVARIANT_ERROR" // Server-side invariant — not the caller's fault (500).
  | "STORAGE_CONTENT_CONFLICT" // Verified object checksum would change.
  | "STORAGE_OBJECT_NOT_WRITABLE" // failed/deleted object — not resurrected.
  | "STORAGE_OBJECT_NOT_DELETABLE" // verified object — cleanup API refuses delete.
  | "VALIDATOR_NOT_CONFIGURED" // Missing validator_key — deployment/content mismatch.
  | "ATTEMPT_NOT_AWAITING_VALIDATION" // Attempt not in submitted state.
  | "WORKBOOK_RENDERER_NOT_CONFIGURED" // Missing renderer_key — same family as VALIDATOR_NOT_CONFIGURED.
  | "WORKBOOK_SOURCE_NOT_CONFIRMED" // No confirmed submission to build workbook from.
  | "WORKBOOK_SOURCE_INTEGRITY_FAILED" // Stored bytes ≠ checksum (500).
  | "WORKBOOK_RENDER_FAILED" // Renderer/content bug (500).
  | "EVIDENCE_NOT_CONFIRMED" // Module 4 evidence not confirmed on website.
  | "EVIDENCE_FROZEN_FOR_ATTEMPT" // Module 4 attempt already pinned evidence snapshot.
  | "MODULE_4_INTERVIEW_EVIDENCE_MISSING" // complete_module without pinned evidence.
  | "INTERVIEW_GATE_NOT_MET" // Module 4 Solution blocks attempted before the confirmed-interview floor is met.
  | "EMAIL_SEND_FAILED"; // Transport rejected the message (SES throttle, unverified recipient in sandbox, credentials).

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
