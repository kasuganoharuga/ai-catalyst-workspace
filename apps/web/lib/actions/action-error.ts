import { ServiceError } from "@ai-catalyst/services/errors";

import { errorCopy } from "@/app/(app)/lib/copy";
import { founderMessageForServiceError } from "@/lib/service-error-copy";
import { webLog } from "@/lib/web-logger";

import type { ActionFailure } from "./action-result";

/**
 * Error-mapping strategy for Founder- and account-facing actions: a
 * ServiceError's real message is written for whoever reads the logs, not
 * for the person who triggered it, so it's logged raw and mapped through
 * founderMessageForServiceError before it reaches the response. An
 * unhandled (non-ServiceError) throw is logged too, then falls back to a
 * generic line — `genericMessage` overrides the default (errorCopy.generic)
 * for a caller with its own copy (account-actions.ts).
 */
export function founderActionResult(ctx: {
  /** Used in both log messages: "Service error in {domain} server action" / "Unhandled {domain} server action error". */
  domain: string;
  /** Defaults to "web_service_action_error" — override when a caller's log queries/alerts already key on a domain-specific event name (prep-actions.ts). */
  event?: string;
  /** Defaults to "web_unhandled_action_error" — same override reason as `event`. */
  unhandledEvent?: string;
  genericMessage?: string;
}): (error: unknown) => ActionFailure {
  return (error: unknown) => {
    if (error instanceof ServiceError) {
      webLog.error({
        event: ctx.event ?? "web_service_action_error",
        message: `Service error in ${ctx.domain} server action`,
        code: error.code,
        detail: error.message,
      });
      return { ok: false, message: founderMessageForServiceError(error) };
    }
    webLog.error({
      event: ctx.unhandledEvent ?? "web_unhandled_action_error",
      message: `Unhandled ${ctx.domain} server action error`,
      error_name: error instanceof Error ? error.name : typeof error,
    });
    return { ok: false, message: ctx.genericMessage ?? errorCopy.generic };
  };
}

/**
 * Error-mapping strategy for admin/mentor/internal-facing actions: a
 * ServiceError's own message IS shown, unmapped and unlogged — these
 * surfaces are read by whoever is operating the platform, not by someone
 * the message needs to be translated for. Only an unhandled throw gets
 * logged, since a ServiceError is already an expected, named failure.
 */
export function internalActionResult(ctx: {
  /** Used in the unhandled-error log message: "Unhandled {domain} server action error". */
  domain: string;
}): (error: unknown) => ActionFailure {
  return (error: unknown) => {
    if (error instanceof ServiceError) {
      return { ok: false, message: error.message };
    }
    webLog.error({
      event: "web_unhandled_action_error",
      message: `Unhandled ${ctx.domain} server action error`,
      error_name: error instanceof Error ? error.name : typeof error,
    });
    return { ok: false, message: "Something went wrong." };
  };
}
