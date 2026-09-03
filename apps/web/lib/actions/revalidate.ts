import { revalidatePath } from "next/cache";

/** Refresh the (app) layout so sidebar/shell data picks up a mutation — the single most common revalidate call across lib/actions/. */
export function revalidateFounderAppShell(): void {
  revalidatePath("/dashboard", "layout");
}

/** Both invitation tables (Founders and Mentors) live under /admin. */
export function revalidateAdminInvitations(): void {
  revalidatePath("/admin");
  revalidatePath("/admin/invitations");
}

/** A Mentor's own invitation activity surfaces on their dashboard and Founders list, as well as the Invitations page itself. */
export function revalidateMentorInvitations(): void {
  revalidatePath("/invitations");
  revalidatePath("/dashboard");
  revalidatePath("/founders");
}

/** Nav/sidebar/dashboard all need to pick up a Mentor entering, exiting, or resetting their founder-preview sandbox. */
export function revalidateFounderPreviewShell(): void {
  revalidatePath("/dashboard", "layout");
  revalidatePath("/sandbox");
}
