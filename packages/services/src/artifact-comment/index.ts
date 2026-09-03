/**
 * Founder <-> Mentor discussion barrel — one confirmed Artifact's comment
 * threads. See infra/database/migrations/0022_artifact_comments.sql for
 * the schema rationale (anchored by heading, not offset; keyed on
 * (module_attempt_id, artifact_definition_id), not a submission version).
 *
 * Authorization: any Founder, Mentor, or Admin may read their own scope —
 * MENTOR_SEES_ALL_FOUNDERS already makes every Mentor able to read every
 * Founder's Artifacts, and this feature's product decision is that the
 * same Mentors may comment. Reading is not quite symmetric either: a
 * Founder's listArtifactCommentThreads silently drops resolved threads —
 * once a Mentor closes one out there's nothing further for the Founder to
 * do with it, so it just stops appearing rather than moving to a resolved
 * section. Writing is asymmetric too: only a Mentor or Admin opens a *new*
 * thread (createArtifactCommentThread rejects a Founder actor outright);
 * the Founder's only write path is replying to a thread a Mentor already
 * opened, and resolving/reopening is likewise Mentor/Admin-only
 * (setThreadStatus). Scope violations resolve NOT_FOUND, never FORBIDDEN,
 * matching mentor/index.ts's enumeration-safety convention — the
 * Founder-cannot-write checks are role capability, not scope, so they're
 * the one thing here that legitimately answers FORBIDDEN. This is the one
 * write path a Mentor has onto Founder data (see the header comment on
 * mentor/index.ts) — it still never advances or rolls back Founder
 * progress.
 *
 * Package-path re-exports only (Turbopack cannot resolve relative ./x.js
 * from this entry).
 */
export {
  listArtifactCommentThreads,
  type ListArtifactCommentThreadsInput,
} from "@ai-catalyst/services/artifact-comment/list-threads";
export {
  createArtifactCommentThread,
  type CreateArtifactCommentThreadInput,
} from "@ai-catalyst/services/artifact-comment/create-thread";
export {
  replyToArtifactCommentThread,
  type ReplyToArtifactCommentThreadInput,
} from "@ai-catalyst/services/artifact-comment/reply";
export {
  resolveArtifactCommentThread,
  reopenArtifactCommentThread,
} from "@ai-catalyst/services/artifact-comment/thread-status";
export {
  editArtifactComment,
  softDeleteArtifactComment,
} from "@ai-catalyst/services/artifact-comment/edit-delete";
export { markArtifactCommentThreadRead } from "@ai-catalyst/services/artifact-comment/read-tracking";
