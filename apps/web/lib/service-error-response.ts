import { NextResponse } from "next/server";

import {
  ServiceError,
  type ServiceErrorCode,
} from "@ai-catalyst/services/errors";

// Exhaustive switch (not a Record lookup with a `?? 400` fallback) so
// TypeScript fails to compile if a new ServiceErrorCode is added without a
// status mapping here.
function statusForCode(code: ServiceErrorCode): number {
  switch (code) {
    case "FORBIDDEN":
      return 403;
    case "UNAUTHENTICATED":
      return 401;
    case "NOT_FOUND":
      return 404;
    case "VALIDATION_ERROR":
      return 400;
    case "INVITATION_ALREADY_PENDING":
      return 409;
    case "INVITATION_NOT_PENDING":
      return 409;
    case "INVITATION_EMAIL_MISMATCH":
      // Closer to "this account has no right to use this invitation" than a
      // generic state conflict.
      return 403;
    case "FOUNDER_WORKSPACE_ALREADY_EXISTS":
      return 409;
    case "RUN_MODULE_NOT_AVAILABLE":
    case "ATTEMPT_PENDING_REVIEW":
    case "ATTEMPT_NOT_EDITABLE":
    case "ATTEMPT_NOT_SUBMITTABLE":
    case "ATTEMPT_RETRY_SOURCE_INVALID":
      return 409;
    case "INTERNAL_INVARIANT_ERROR":
      // Never the caller's fault (e.g. content misconfiguration) — a 500,
      // not a 4xx, even though it's a typed ServiceError.
      return 500;
    case "STORAGE_CONTENT_CONFLICT":
      return 409;
    case "STORAGE_OBJECT_NOT_WRITABLE":
      return 409;
    case "STORAGE_OBJECT_NOT_DELETABLE":
      return 409;
    default: {
      const _exhaustive: never = code;
      return _exhaustive;
    }
  }
}

// Shared by every Admin API route: maps a ServiceError to a structured
// `{ error: { code, message } }` body with the right HTTP status, and turns
// anything else into a generic logged 500 — no stack traces ever reach the
// browser (quality-and-git.mdc).
export function serviceErrorResponse(error: unknown): NextResponse {
  if (error instanceof ServiceError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: statusForCode(error.code) },
    );
  }

  console.error("Unhandled error in Admin API route:", error);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong." } },
    { status: 500 },
  );
}
