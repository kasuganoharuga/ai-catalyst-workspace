// Not a ServiceError: this script has no ActorContext and is never mapped
// to an HTTP status or MCP tool error.
export type ContentSeedErrorCode =
  // Immutable row content no longer matches content constants.
  | "PUBLISHED_CONTENT_MISMATCH"
  // Target row is retired.
  | "CONTENT_ALREADY_RETIRED"
  // DB has module/question/artifact/binding rows absent from constants.
  | "CONTENT_GRAPH_MISMATCH"
  // Publish precondition failed (e.g. prompt versions still draft).
  | "PUBLISH_PRECONDITION_FAILED"
  // validationConfig does not parse for its validatorKey.
  | "INVALID_VALIDATION_CONFIG"
  // Seed cannot mutable→frozen; only `pnpm db:freeze` may freeze.
  | "CONTENT_LOCK_FREEZE_VIA_SEED_FORBIDDEN"
  // Destructive archive/reorder/revive without --allow-archive guardrail.
  | "DESTRUCTIVE_CONTENT_CHANGE_NOT_ALLOWED"
  // Active module would be demoted to draft — remove from constants instead.
  | "MODULE_DEMOTION_UNSUPPORTED"
  // Resequence offset would overflow sequence_index.
  | "SEQUENCE_RESEQUENCE_OVERFLOW"
  // Frozen program_version still has mutable bound prompt_version.
  | "CONTENT_LOCK_INCONSISTENT"
  // db:freeze target is not content_lock='mutable'.
  | "PROGRAM_VERSION_NOT_MUTABLE"
  // Run reconciliation pending — run `pnpm db:reconcile-runs` before freeze.
  | "RUN_RECONCILIATION_PENDING"
  // Prompt freeze would strand another mutable program_version (use flag to override).
  | "SHARED_MUTABLE_PROMPT_DEPENDENCY";

export class ContentSeedError extends Error {
  constructor(
    public readonly code: ContentSeedErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ContentSeedError";
  }
}
