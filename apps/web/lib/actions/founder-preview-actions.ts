"use server";

import {
  createFounderSandbox,
  enterFounderPreview,
  exitFounderPreview,
  restartFounderSandbox,
} from "@ai-catalyst/services/mentor/founder-preview";

import type { ActionResult } from "./action-result";
import { internalActionResult } from "./action-error";
import { requireRealMentorActor } from "./require-actor";
import { revalidateFounderPreviewShell } from "./revalidate";

// A Mentor managing their own founder-preview sandbox — entering/exiting
// preview, starting a brand-new sandbox, or restarting the current one's
// Run. Uses requireRealMentorActor, never requireFounderActor or the
// preview-aware builders: these actions are about the preview overlay
// itself, so they must always see the Mentor's real identity, the same way
// packages/services/src/mentor/founder-preview.ts's assertRealMentor does.
// Otherwise exitFounderPreviewAction would reject the one call that's
// supposed to work *while* previewing.

const toActionResult = internalActionResult({ domain: "founder-preview" });

/** Provisions the sandbox on first use, then switches this session into it. */
export async function enterFounderPreviewAction(): Promise<ActionResult> {
  try {
    const actor = await requireRealMentorActor();
    await enterFounderPreview(actor);
  } catch (error) {
    return toActionResult(error);
  }
  revalidateFounderPreviewShell();
  return { ok: true };
}

export async function exitFounderPreviewAction(): Promise<ActionResult> {
  try {
    const actor = await requireRealMentorActor();
    await exitFounderPreview(actor);
  } catch (error) {
    return toActionResult(error);
  }
  revalidateFounderPreviewShell();
  return { ok: true };
}

/** Archives the current sandbox's Run — never deletes anything — and lets a fresh one start, without creating a new sandbox Workspace. */
export async function restartFounderSandboxAction(): Promise<ActionResult> {
  try {
    const actor = await requireRealMentorActor();
    await restartFounderSandbox(actor);
  } catch (error) {
    return toActionResult(error);
  }
  revalidateFounderPreviewShell();
  return { ok: true };
}

/**
 * Starts over with a brand-new sandbox Workspace. The old current sandbox
 * (if any) becomes permanently unreachable through the product — the
 * caller must have already confirmed this with the Mentor (see
 * StartNewSandboxButton's dialog) before calling this action.
 */
export async function createFounderSandboxAction(): Promise<ActionResult> {
  try {
    const actor = await requireRealMentorActor();
    await createFounderSandbox(actor);
  } catch (error) {
    return toActionResult(error);
  }
  revalidateFounderPreviewShell();
  return { ok: true };
}
