import { NextResponse } from "next/server";

import {
  ServiceError,
  type ServiceErrorCode,
} from "@ai-catalyst/services/errors";

import { webLog } from "@/lib/web-logger";

// Exhaustive switch so new ServiceErrorCode without a mapping fails compile.
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
      return 403;
    case "FOUNDER_WORKSPACE_ALREADY_EXISTS":
      return 409;
    case "RUN_MODULE_NOT_AVAILABLE":
    case "MODULE_NOT_READY_FOR_CONFIRMATION":
    case "ATTEMPT_PENDING_REVIEW":
    case "ATTEMPT_NOT_EDITABLE":
    case "ATTEMPT_NOT_SUBMITTABLE":
    case "ATTEMPT_RETRY_SOURCE_INVALID":
    case "EVIDENCE_NOT_CONFIRMED":
    case "EVIDENCE_FROZEN_FOR_ATTEMPT":
    case "MODULE_4_INTERVIEW_EVIDENCE_MISSING":
    case "INTERVIEW_GATE_NOT_MET":
      return 409;
    case "INTERNAL_INVARIANT_ERROR":
      return 500;
    case "STORAGE_CONTENT_CONFLICT":
      return 409;
    case "STORAGE_OBJECT_NOT_WRITABLE":
      return 409;
    case "STORAGE_OBJECT_NOT_DELETABLE":
      return 409;
    case "VALIDATOR_NOT_CONFIGURED":
    case "ATTEMPT_NOT_AWAITING_VALIDATION":
    case "WORKBOOK_RENDERER_NOT_CONFIGURED":
    case "WORKBOOK_SOURCE_NOT_CONFIRMED":
      return 409;
    case "WORKBOOK_SOURCE_INTEGRITY_FAILED":
    case "WORKBOOK_RENDER_FAILED":
      return 500;
    // Upstream provider failure, not the caller's fault.
    case "EMAIL_SEND_FAILED":
      return 502;
    default: {
      const _exhaustive: never = code;
      return _exhaustive;
    }
  }
}

// Maps ServiceError to structured JSON + HTTP status; unknown errors become logged 500s (no stack traces).
export function serviceErrorResponse(error: unknown): NextResponse {
  if (error instanceof ServiceError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: statusForCode(error.code) },
    );
  }

  webLog.error({
    event: "web_unhandled_route_error",
    message: "Unhandled error in Admin API route",
    error_name: error instanceof Error ? error.name : typeof error,
  });
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong." } },
    { status: 500 },
  );
}
