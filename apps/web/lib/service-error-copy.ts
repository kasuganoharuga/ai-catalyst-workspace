import { ServiceError } from "@ai-catalyst/services/errors";
import type { ServiceErrorCode } from "@ai-catalyst/services/errors";

import { errorCopy } from "@/app/(app)/lib/copy";

// Map ServiceError.code → founder-facing copy. Prefer the stable code over
// log-oriented `error.message` (which can leak state names / field keys).
// Unmapped codes fall back to a generic line. VALIDATION_ERROR stays generic
// until per-field form errors exist.
const FOUNDER_MESSAGE_BY_CODE: Partial<Record<ServiceErrorCode, string>> = {
  UNAUTHENTICATED: "Your session has expired. Sign in again to continue.",
  FORBIDDEN: "You don't have permission to do that.",
  NOT_FOUND: "We couldn't find that. Refresh the page and try again.",
  VALIDATION_ERROR:
    "Some of those details couldn't be saved. Check what you entered and try again.",

  RUN_MODULE_NOT_AVAILABLE:
    "This module isn't open yet. Finish the one before it first.",
  MODULE_NOT_READY_FOR_CONFIRMATION:
    "There's nothing to confirm here yet. This page updates once your work is saved and nothing is missing from it.",

  ATTEMPT_PENDING_REVIEW:
    "Your work is being checked. Refresh in a moment to see the result.",
  ATTEMPT_NOT_EDITABLE:
    "Nothing more can be saved to this module until you start it again. Everything you've answered so far is kept.",
  ATTEMPT_NOT_SUBMITTABLE:
    "This isn't ready to submit yet. Finish the conversation in your AI assistant first.",
  ATTEMPT_RETRY_SOURCE_INVALID:
    "There's nothing left to retry here. Confirm this module, or ask your program lead.",
  ATTEMPT_NOT_AWAITING_VALIDATION:
    "This work has already been checked. Refresh the page to see where you're up to.",
  EVIDENCE_NOT_CONFIRMED:
    "Confirm your interview evidence on this website before continuing in Claude.",
  EVIDENCE_FROZEN_FOR_ATTEMPT:
    "A Claude session is already using your confirmed evidence. Finish or retry that module attempt before changing interviews.",
  MODULE_4_INTERVIEW_EVIDENCE_MISSING:
    "Interview evidence must be confirmed and pinned for this Module 4 attempt before the module can finish. Confirm evidence on the website, then continue in Claude.",
  INTERVIEW_GATE_NOT_MET:
    "Module 4 needs at least 5 confirmed interview transcripts before Solution work can start. Share more interview notes with your AI assistant first.",
  EMAIL_SEND_FAILED:
    "We couldn't send that email just now. Try again in a moment, and tell your program lead if it keeps happening.",

  VALIDATOR_NOT_CONFIGURED:
    "This module isn't ready to check your work yet. Try again shortly, and tell your program lead if it keeps happening.",

  STORAGE_CONTENT_CONFLICT:
    "That document has already been saved with different content. Ask your AI assistant to save a new version.",
  STORAGE_OBJECT_NOT_WRITABLE:
    "We couldn't save that file. Ask your AI assistant to try saving it again.",
  STORAGE_OBJECT_NOT_DELETABLE:
    "That file is already saved and can't be removed.",

  INTERNAL_INVARIANT_ERROR:
    "Something went wrong on our side. Tell your program lead if it keeps happening.",
};

/**
 * The message a founder should see for a service-layer failure. Falls back
 * to the generic line for any code without an entry.
 */
export function founderMessageForServiceError(error: ServiceError): string {
  return FOUNDER_MESSAGE_BY_CODE[error.code] ?? errorCopy.generic;
}

/**
 * True when `error` is a ServiceError — kept here so callers don't have to
 * import the class purely for an `instanceof` check.
 */
export function isServiceError(error: unknown): error is ServiceError {
  return error instanceof ServiceError;
}
