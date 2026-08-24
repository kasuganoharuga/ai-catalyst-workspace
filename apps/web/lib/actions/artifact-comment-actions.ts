"use server";

import { revalidatePath } from "next/cache";

import {
  createArtifactCommentThread,
  editArtifactComment,
  markArtifactCommentThreadRead,
  reopenArtifactCommentThread,
  replyToArtifactCommentThread,
  resolveArtifactCommentThread,
  softDeleteArtifactComment,
} from "@ai-catalyst/services/artifact-comment";
import type {
  ArtifactComment,
  ArtifactCommentThread,
} from "@ai-catalyst/shared";

import {
  commentActionInputSchema,
  createArtifactCommentThreadInputSchema,
  editArtifactCommentInputSchema,
  firstZodMessage,
  replyToArtifactCommentThreadInputSchema,
  threadActionInputSchema,
} from "@/lib/validation/artifact-comment";

import type { ActionResultWith } from "./action-result";
import { internalActionResult } from "./action-error";
import { requireCommentActor } from "./require-actor";

// Founder <-> Mentor comment threads on one Artifact — the same shape as
// mentor-actions.ts/prep-actions.ts: session -> role check ->
// actorContextFromSessionWithPreview -> service call -> ServiceError mapped to
// { ok: false, message } -> revalidatePath. `pathname` is passed in from
// the client (via usePathname()) because the Founder and Mentor artefact
// pages live at different URLs and this file is shared between both.

export type ArtifactCommentActionResult<T> = ActionResultWith<{ data: T }>;

const toActionResult = internalActionResult({ domain: "artifact-comment" });

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
