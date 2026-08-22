"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { ServiceError } from "@ai-catalyst/services/errors";
import {
  createFounderSandbox,
  enterFounderPreview,
  exitFounderPreview,
  restartFounderSandbox,
} from "@ai-catalyst/services/mentor/founder-preview";

import { actorContextFromSession } from "@/lib/actor-context";
import { auth } from "@/lib/auth";
import { webLog } from "@/lib/web-logger";

// A Mentor managing their own founder-preview sandbox — entering/exiting
// preview, starting a brand-new sandbox, or restarting the current one's
// Run. Deliberately checks session.user.role directly (via the plain,
// non-preview-aware actor builder), never effectiveRole: these actions are
// about the preview overlay itself, so they must always see the Mentor's
// real identity, the same way
// packages/services/src/mentor/founder-preview.ts's assertRealMentor does.
// Otherwise exitFounderPreviewAction would reject the one call that's
// supposed to work *while* previewing.

export type FounderPreviewActionResult =
  { ok: true } | { ok: false; message: string };

async function requireMentorActor() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    throw new ServiceError("UNAUTHENTICATED", "Sign in required.");
  }
  const actor = actorContextFromSession(session);
  if (actor.role !== "mentor") {
    throw new ServiceError("FORBIDDEN", "Mentor access required.");
  }
  return actor;
}

function toActionResult(error: unknown): FounderPreviewActionResult {
  if (error instanceof ServiceError) {
    return { ok: false, message: error.message };
  }
  webLog.error({
    event: "web_unhandled_action_error",
    message: "Unhandled founder-preview server action error",
    error_name: error instanceof Error ? error.name : typeof error,
  });
  return { ok: false, message: "Something went wrong." };
}

/** Revalidate the (app) shell so nav/sidebar/dashboard pick up the role switch. */
function revalidateAppShell() {
  revalidatePath("/dashboard", "layout");
  revalidatePath("/sandbox");
}

/** Provisions the sandbox on first use, then switches this session into it. */
export async function enterFounderPreviewAction(): Promise<FounderPreviewActionResult> {
  try {
    const actor = await requireMentorActor();
    await enterFounderPreview(actor);
  } catch (error) {
    return toActionResult(error);
  }
  revalidateAppShell();
  return { ok: true };
}

export async function exitFounderPreviewAction(): Promise<FounderPreviewActionResult> {
  try {
    const actor = await requireMentorActor();
    await exitFounderPreview(actor);
  } catch (error) {
    return toActionResult(error);
  }
  revalidateAppShell();
  return { ok: true };
}

/** Archives the current sandbox's Run — never deletes anything — and lets a fresh one start, without creating a new sandbox Workspace. */
export async function restartFounderSandboxAction(): Promise<FounderPreviewActionResult> {
  try {
    const actor = await requireMentorActor();
    await restartFounderSandbox(actor);
  } catch (error) {
    return toActionResult(error);
  }
  revalidateAppShell();
  return { ok: true };
}

/**
 * Starts over with a brand-new sandbox Workspace. The old current sandbox
 * (if any) becomes permanently unreachable through the product — the
 * caller must have already confirmed this with the Mentor (see
 * StartNewSandboxButton's dialog) before calling this action.
 */
export async function createFounderSandboxAction(): Promise<FounderPreviewActionResult> {
  try {
    const actor = await requireMentorActor();
    await createFounderSandbox(actor);
  } catch (error) {
    return toActionResult(error);
  }
  revalidateAppShell();
  return { ok: true };
}
