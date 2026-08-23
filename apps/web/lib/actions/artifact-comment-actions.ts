"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import {
  createArtifactCommentThread,
  editArtifactComment,
  markArtifactCommentThreadRead,
  reopenArtifactCommentThread,
  replyToArtifactCommentThread,
  resolveArtifactCommentThread,
  softDeleteArtifactComment,
} from "@ai-catalyst/services/artifact-comment";
import { ServiceError } from "@ai-catalyst/services/errors";
import type {
  ArtifactComment,
  ArtifactCommentThread,
} from "@ai-catalyst/shared";

import { actorContextFromSessionWithPreview } from "@/lib/actor-context";
import { auth } from "@/lib/auth";
import {
  commentActionInputSchema,
  createArtifactCommentThreadInputSchema,
  editArtifactCommentInputSchema,
  firstZodMessage,
  replyToArtifactCommentThreadInputSchema,
  threadActionInputSchema,
} from "@/lib/validation/artifact-comment";
import { webLog } from "@/lib/web-logger";

// Founder <-> Mentor comment threads on one Artifact — the same shape as
// mentor-actions.ts/prep-actions.ts: session -> role check ->
// actorContextFromSessionWithPreview -> service call -> ServiceError mapped to
// { ok: false, message } -> revalidatePath. `pathname` is passed in from
// the client (via usePathname()) because the Founder and Mentor artefact
// pages live at different URLs and this file is shared between both.

export type ArtifactCommentActionResult<T> =
  { ok: true; data: T } | { ok: false; message: string };

async function requireCommentActor() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    throw new ServiceError("UNAUTHENTICATED", "Sign in required.");
  }
  if (session.user.role !== "founder" && session.user.role !== "mentor") {
    throw new ServiceError("FORBIDDEN", "Founder or Mentor access required.");
  }
  // Preview-aware: a Mentor walking the Founder flow in their own sandbox
  // (actingAs: "founder") must reply through the same branch a real
  // Founder does — see artifact-comment/index.ts's assertActorCanAccessWorkspace.
  return actorContextFromSessionWithPreview(session);
}

function toActionResult(error: unknown): { ok: false; message: string } {
  if (error instanceof ServiceError) {
    return { ok: false, message: error.message };
  }
  webLog.error({
    event: "web_unhandled_action_error",
    message: "Unhandled artifact-comment server action error",
    error_name: error instanceof Error ? error.name : typeof error,
  });
  return { ok: false, message: "Something went wrong." };
}

export async function createArtifactCommentThreadAction(
  input: unknown,
): Promise<ArtifactCommentActionResult<ArtifactCommentThread>> {
  const parsed = createArtifactCommentThreadInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: firstZodMessage(parsed.error) };
  }
  try {
    const actor = await requireCommentActor();
    const thread = await createArtifactCommentThread(actor, {
      attemptId: parsed.data.attemptId,
      artifactKey: parsed.data.artifactKey,
      anchor: parsed.data.anchor,
      body: parsed.data.body,
    });
    revalidatePath(parsed.data.pathname);
    return { ok: true, data: thread };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function replyToArtifactCommentThreadAction(
  input: unknown,
): Promise<ArtifactCommentActionResult<ArtifactComment>> {
  const parsed = replyToArtifactCommentThreadInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: firstZodMessage(parsed.error) };
  }
  try {
    const actor = await requireCommentActor();
    const comment = await replyToArtifactCommentThread(actor, {
      threadId: parsed.data.threadId,
      body: parsed.data.body,
    });
    revalidatePath(parsed.data.pathname);
    return { ok: true, data: comment };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function resolveArtifactCommentThreadAction(
  input: unknown,
): Promise<ArtifactCommentActionResult<null>> {
  const parsed = threadActionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: firstZodMessage(parsed.error) };
  }
  try {
    const actor = await requireCommentActor();
    await resolveArtifactCommentThread(actor, {
      threadId: parsed.data.threadId,
    });
    revalidatePath(parsed.data.pathname);
    return { ok: true, data: null };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function reopenArtifactCommentThreadAction(
  input: unknown,
): Promise<ArtifactCommentActionResult<null>> {
  const parsed = threadActionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: firstZodMessage(parsed.error) };
  }
  try {
    const actor = await requireCommentActor();
    await reopenArtifactCommentThread(actor, {
      threadId: parsed.data.threadId,
    });
    revalidatePath(parsed.data.pathname);
    return { ok: true, data: null };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function editArtifactCommentAction(
  input: unknown,
): Promise<ArtifactCommentActionResult<ArtifactComment>> {
  const parsed = editArtifactCommentInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: firstZodMessage(parsed.error) };
  }
  try {
    const actor = await requireCommentActor();
    const comment = await editArtifactComment(actor, {
      commentId: parsed.data.commentId,
      body: parsed.data.body,
    });
    revalidatePath(parsed.data.pathname);
    return { ok: true, data: comment };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function softDeleteArtifactCommentAction(
  input: unknown,
): Promise<ArtifactCommentActionResult<null>> {
  const parsed = commentActionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: firstZodMessage(parsed.error) };
  }
  try {
    const actor = await requireCommentActor();
    await softDeleteArtifactComment(actor, {
      commentId: parsed.data.commentId,
    });
    revalidatePath(parsed.data.pathname);
    return { ok: true, data: null };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function markArtifactCommentThreadReadAction(
  input: unknown,
): Promise<ArtifactCommentActionResult<null>> {
  const parsed = threadActionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: firstZodMessage(parsed.error) };
  }
  try {
    const actor = await requireCommentActor();
    await markArtifactCommentThreadRead(actor, {
      threadId: parsed.data.threadId,
    });
    // No revalidatePath: marking read only affects unread badges the
    // client already updates optimistically — not worth a full RSC pass.
    return { ok: true, data: null };
  } catch (error) {
    return toActionResult(error);
  }
}
