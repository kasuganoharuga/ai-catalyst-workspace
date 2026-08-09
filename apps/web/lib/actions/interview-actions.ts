"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import {
  addInterviewRecord,
  completeInterviewRecord,
  confirmInterviewEvidence,
  reopenInterviewEvidence,
  reopenInterviewRecord,
  saveInterviewRecordDraft,
  submitInterviewSetForReview,
} from "@ai-catalyst/services/interview";
import { ServiceError } from "@ai-catalyst/services/errors";

import { errorCopy } from "@/app/(app)/lib/copy";
import { actorContextFromSession } from "@/lib/actor-context";
import { auth } from "@/lib/auth";
import { founderMessageForServiceError } from "@/lib/service-error-copy";

export type InterviewActionResult =
  { ok: true; recordId?: string } | { ok: false; message: string };

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

function toResult(error: unknown): InterviewActionResult {
  if (error instanceof ServiceError) {
    console.error(
      "Service error in interview action:",
      error.code,
      error.message,
    );
    return { ok: false, message: founderMessageForServiceError(error) };
  }
  console.error("Unhandled interview action error:", error);
  return { ok: false, message: errorCopy.generic };
}

function revalidateInterviewPaths() {
  revalidatePath("/modules", "layout");
  revalidatePath("/artefacts", "page");
  revalidatePath("/dashboard", "layout");
}

export async function addInterviewRecordAction(
  activityId: string,
): Promise<InterviewActionResult> {
  try {
    const actor = await requireFounderActor();
    const record = await addInterviewRecord(actor, activityId);
    revalidateInterviewPaths();
    return { ok: true, recordId: record.id };
  } catch (error) {
    return toResult(error);
  }
}

export async function saveInterviewRecordDraftAction(
  recordId: string,
  fields: unknown,
): Promise<InterviewActionResult> {
  try {
    const actor = await requireFounderActor();
    await saveInterviewRecordDraft(actor, recordId, fields);
    revalidateInterviewPaths();
    return { ok: true, recordId };
  } catch (error) {
    return toResult(error);
  }
}

export async function completeInterviewRecordAction(
  recordId: string,
  fields: unknown,
): Promise<InterviewActionResult> {
  try {
    const actor = await requireFounderActor();
    await completeInterviewRecord(actor, recordId, fields);
    revalidateInterviewPaths();
    return { ok: true, recordId };
  } catch (error) {
    return toResult(error);
  }
}

export async function reopenInterviewRecordAction(
  recordId: string,
): Promise<InterviewActionResult> {
  try {
    const actor = await requireFounderActor();
    await reopenInterviewRecord(actor, recordId);
    revalidateInterviewPaths();
    return { ok: true, recordId };
  } catch (error) {
    return toResult(error);
  }
}

export async function submitInterviewSetForReviewAction(
  programRunId: string,
): Promise<InterviewActionResult> {
  try {
    const actor = await requireFounderActor();
    await submitInterviewSetForReview(actor, programRunId);
    revalidateInterviewPaths();
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}

export async function confirmInterviewEvidenceAction(
  programRunId: string,
): Promise<InterviewActionResult> {
  try {
    const actor = await requireFounderActor();
    await confirmInterviewEvidence(actor, programRunId);
    revalidateInterviewPaths();
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}

export async function reopenInterviewEvidenceAction(
  programRunId: string,
): Promise<InterviewActionResult> {
  try {
    const actor = await requireFounderActor();
    await reopenInterviewEvidence(actor, programRunId);
    revalidateInterviewPaths();
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}
