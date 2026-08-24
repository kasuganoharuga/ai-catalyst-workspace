"use server";

import { revalidatePath } from "next/cache";

import { isFounderPreview } from "@ai-catalyst/contracts/actor-context";
import { updateMyProfile } from "@ai-catalyst/services/profile";
import { ServiceError } from "@ai-catalyst/services/errors";

import { firstZodMessage } from "@/lib/validation/common";
import { updateProfileInputSchema } from "@/lib/validation/profile";

import type { ActionResult } from "./action-result";
import { founderActionResult } from "./action-error";
import { requireAccountActor } from "./require-actor";

// Profile + password are shared across Founder, Mentor, and Admin.
// packages/services/profile already allows all three
// (assertRole(actor, ["founder", "mentor", "admin"])) — this file's role
// check only decides who may reach it from a request. Anything that stays
// Founder-only (the AI assistant choice, MCP revocation) is still in
// founder-actions.ts.

const toActionResult = founderActionResult({
  domain: "account",
  genericMessage: "That didn't save. Try again in a moment.",
});

export async function updateProfileAction(
  input: unknown,
): Promise<ActionResult> {
  const parsed = updateProfileInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: firstZodMessage(parsed.error) };
  }

  try {
    const actor = await requireAccountActor();
    // user_profiles is keyed by user_id, not Workspace — this would edit
    // the same profile shown once back to being a Mentor. Defense in depth
    // behind the UI's own lock (profile/page.tsx's PreviewLockedNotice).
    if (isFounderPreview(actor)) {
      throw new ServiceError(
        "FORBIDDEN",
        "Profile details aren't editable while previewing.",
      );
    }
    await updateMyProfile(actor, parsed.data);
    // Founder/Mentor shell and Admin shell both show the display name from
    // the profile — refresh whichever layout the actor is in.
    revalidatePath("/dashboard", "layout");
    revalidatePath("/admin", "layout");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}
