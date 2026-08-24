// Shared Server Action result shapes. No "use server" — pure types only.

export type ActionResult = { ok: true } | { ok: false; message: string };

/** The failure half of every ActionResult-shaped return — every error-mapping function in action-error.ts returns this. */
export type ActionFailure = { ok: false; message: string };

/**
 * ActionResult with success-only fields attached at the top level, e.g.
 * `{ ok: true, rawToken }` — not nested under a `data` key. For a result
 * that should nest instead, wrap `T` in `{ data: T }` yourself (see
 * artifact-comment-actions.ts's ArtifactCommentActionResult).
 */
export type ActionResultWith<T> = ({ ok: true } & T) | ActionFailure;

/** Shared by admin-actions.ts and mentor-actions.ts — both create Founder invitations through the same action shape. */
export type CreateInvitationResult = ActionResultWith<{ rawToken: string }>;
