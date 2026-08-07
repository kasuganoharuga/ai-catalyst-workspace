// Not a ServiceError: this script has no ActorContext and is never mapped
// to an HTTP status or MCP tool error.
export type ContentSeedErrorCode =
  // A row that should be immutable already exists with content that no
  // longer matches the content constants.
  | "PUBLISHED_CONTENT_MISMATCH"
  // The target row is retired and can no longer be the target of this run.
  | "CONTENT_ALREADY_RETIRED"
  // The database has rows (module/question/artifact/prompt binding) that
  // are not present in the content constants.
  | "CONTENT_GRAPH_MISMATCH"
  // A publish-step precondition (e.g. "all Prompt Versions are draft
  // before publishing") did not hold.
  | "PUBLISH_PRECONDITION_FAILED"
  // An artifact's `validationConfig` does not parse against the schema for
  // its `validatorKey` (see rule-schema.ts's `validateConfigForValidator`).
  | "INVALID_VALIDATION_CONFIG"
  // The database row is content_lock='mutable' but the content constant
  // says "frozen" — only `pnpm db:freeze` may move a row from mutable to
  // frozen, this seed script never does. The reverse (DB frozen, constant
  // still mutable) is the ordinary post-freeze state and is not an error.
  | "CONTENT_LOCK_FREEZE_VIA_SEED_FORBIDDEN"
  // A module/question/artifact/binding removal or reorder would archive,
  // revive, or resequence rows and the caller has not passed --allow-archive
  // (or ALLOW_DESTRUCTIVE_CONTENT_CHANGE=1) — a guardrail against an import
  // bug or bad merge silently archiving real content on deploy.
  | "DESTRUCTIVE_CONTENT_CHANGE_NOT_ALLOWED"
  // A module previously active would be demoted to a draft placeholder by
  // the content constants (isPublishable flipped to false on a module that
  // is already active) — unsupported; remove the module from the content
  // constants instead, which archives it without disturbing any Run's
  // existing program_run_modules rows.
  | "MODULE_DEMOTION_UNSUPPORTED"
  // planOrderedRows computed a temporary resequencing offset that would
  // overflow the `sequence_index` integer column — almost certainly an
  // implausible sequenceIndex value in the content constants, not a real
  // ordering need.
  | "SEQUENCE_RESEQUENCE_OVERFLOW"
  // A prompt_version bound to this program_version is still
  // content_lock='mutable' even though this program_version itself is
  // content_lock='frozen' — a symptom of `pnpm db:freeze` having missed
  // this prompt (an incomplete cascade), not a state the seed script
  // should silently tolerate.
  | "CONTENT_LOCK_INCONSISTENT"
  // db:freeze was targeted at a program_version that is not
  // content_lock='mutable' (already frozen, or never was living).
  | "PROGRAM_VERSION_NOT_MUTABLE"
  // db:freeze's hard precondition: at least one non-archived Program Run's
  // reconciliation plan is not empty. Freezing here would permanently
  // strand that Run's drift — see workflow/internal/reconcile-run-modules.ts's
  // planBranchReconciliation. Run `pnpm db:reconcile-runs` first.
  | "RUN_RECONCILIATION_PENDING"
  // A prompt_version freeze would be about to cascade-freeze is still
  // reachable from a DIFFERENT program_version that is itself still
  // content_lock='mutable' — freezing it would silently strand that other
  // program_version's ability to keep editing this prompt in place.
  // Default: abort. `--allow-shared-prompt-freeze` proceeds anyway (the
  // other program_version will then have to bump this prompt's
  // versionNumber on its own next edit).
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
