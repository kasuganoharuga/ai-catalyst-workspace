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
  | "PUBLISH_PRECONDITION_FAILED";

export class ContentSeedError extends Error {
  constructor(
    public readonly code: ContentSeedErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ContentSeedError";
  }
}
