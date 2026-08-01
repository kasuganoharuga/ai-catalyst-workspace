import { ServiceError } from "@ai-catalyst/services/errors";
import type { ServiceErrorCode } from "@ai-catalyst/services/errors";

import { errorCopy } from "@/app/(app)/lib/copy";

// Service error messages are written for whoever is reading the logs, and
// until now they reached founders untouched: `toActionResult` returned
// `error.message` verbatim, so a founder could be shown
// `Module is "locked" and cannot be started or resumed.` or
// `contactEmail must be a valid email address.` — internal state names and
// camelCase field names and all.
//
// This maps the code (stable) rather than the message (free to change) to
// something a founder can act on. Anything unmapped falls back to the
// generic line, which is the safe direction: a vague message is better
// than one that leaks an identifier.
//
// Known limitation, deliberately not solved here: VALIDATION_ERROR loses
// its specificity, because the underlying messages name raw field keys.
// Per-field form errors are the real fix and are a larger change than this
// pass — the generic line at least points at the right place.
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
