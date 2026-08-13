"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { ServiceError } from "@ai-catalyst/services/errors";
import {
  uploadPrepDocument,
  withdrawPrepDocument,
} from "@ai-catalyst/services/prep";

import { actorContextFromSession } from "@/lib/actor-context";
import { auth } from "@/lib/auth";
import { errorCopy } from "@/app/(app)/lib/copy";
import { founderMessageForServiceError } from "@/lib/service-error-copy";
import { webLog } from "@/lib/web-logger";

// Founder-uploaded prep material for a Module's Work step.
//
// Server actions rather than a route handler: Next.js hands a multipart
// body straight through as FormData here, so a bespoke route would only
// duplicate the session/actor plumbing every other founder mutation
// already goes through.

export type PrepActionResult = { ok: true } | { ok: false; message: string };

async function requireFounderActor() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    throw new ServiceError("UNAUTHENTICATED", "Sign in required.");
  }
  const actor = actorContextFromSession(session);
  if (actor.role !== "founder") {
    throw new ServiceError("FORBIDDEN", "Founder access required.");
  }
  return actor;
}

function toActionResult(error: unknown): PrepActionResult {
  if (error instanceof ServiceError) {
    webLog.error({
      event: "web_prep_action_error",
      message: "Service error in prep server action",
      code: error.code,
      detail: error.message,
    });
    return { ok: false, message: founderMessageForServiceError(error) };
  }
  webLog.error({
    event: "web_unhandled_prep_action_error",
    message: "Unhandled prep server action error",
    error_name: error instanceof Error ? error.name : typeof error,
  });
  return { ok: false, message: errorCopy.generic };
}

/**
 * Accepts one file from the Work step's upload window.
 *
 * The Service re-derives content type from the allowlist and measures the
 * real byte length, so nothing here trusts what the browser declared —
 * this only gets the bytes across the boundary.
 */
export async function uploadPrepDocumentAction(
  formData: FormData,
): Promise<PrepActionResult> {
  try {
    const actor = await requireFounderActor();

    const programRunModuleId = formData.get("programRunModuleId");
    const file = formData.get("file");
    const note = formData.get("note");

    if (typeof programRunModuleId !== "string" || programRunModuleId === "") {
      throw new ServiceError("VALIDATION_ERROR", "Module is required.");
    }
    if (!(file instanceof File)) {
      throw new ServiceError("VALIDATION_ERROR", "Choose a file to upload.");
    }

    await uploadPrepDocument(actor, {
      programRunModuleId,
      filename: file.name,
      contentType: file.type,
      content: Buffer.from(await file.arrayBuffer()),
      note: typeof note === "string" ? note : "",
    });

    revalidatePath("/modules/[moduleKey]", "page");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

/** Removes a document from the Work step. The row is kept, not deleted. */
export async function withdrawPrepDocumentAction(
  prepDocumentId: string,
): Promise<PrepActionResult> {
  try {
    const actor = await requireFounderActor();
    await withdrawPrepDocument(actor, prepDocumentId);
    revalidatePath("/modules/[moduleKey]", "page");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}
