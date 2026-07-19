// Bytes-only contract — a Provider never learns about Workspace, Actor,
// `storage_objects`, or the pending/uploaded/verified/failed/deleted
// state machine. All of that business state lives in index.ts
// (StorageService); a Provider only ever answers "is this exact key
// present, and what does it look like at rest".
//
// Artifact download product default is stream-through-backend
// (ArtifactService → getObject), not browser → signed URL → S3.
// `createDownloadUrl` is an optional escape hatch on the provider;
// business code must not depend on it.
//
// Type-only file: nothing here is imported by value, so it's a plain
// relative import from every other file in this directory without needing
// its own package.json exports entry.

export interface PutObjectInput {
  key: string;
  body: Buffer;
  contentType: string;
}

export interface CopyObjectInput {
  sourceKey: string;
  destinationKey: string;
}

export interface DownloadUrlInput {
  key: string;
  expiresInSeconds: number;
  /** e.g. `attachment; filename="verdict.md"` for browser downloads. */
  responseContentDisposition?: string;
}

export interface DownloadUrl {
  url: string;
  expiresAt: Date;
}

// Minimal V1 shape. May later grow toward a richer ArtifactMetadata
// (etag, mime, createdAt, …) shared across Local / S3 / future OSS —
// extend fields only when a real caller needs them.
export interface ProviderObjectMetadata {
  sizeBytes: number;
  sha256: string;
}

export interface StorageProvider {
  /**
   * Atomically makes the complete object available at `key`. A partial
   * object must never be observable at the final key — implementations
   * (e.g. LocalStorageProvider's temp-file-then-rename) enforce this
   * entirely internally, within this single call; callers never see or
   * manage a separate "promote"/"commit" step. Overwriting an existing
   * key is allowed at this layer (the Service's hash-comparison /
   * immutability rules for `verified` objects live above this
   * interface, not here).
   */
  putObject(input: PutObjectInput): Promise<ProviderObjectMetadata>;

  /** Throws if no object exists at `key`. */
  getObject(key: string): Promise<Buffer>;

  /**
   * Returns `null` (not a throw) when no object exists at `key`.
   * Prefer `exists` when only presence matters; use this when the caller
   * needs size/checksum without a separate get.
   */
  headObject(key: string): Promise<ProviderObjectMetadata | null>;

  /** True iff an object is present at `key`. */
  exists(key: string): Promise<boolean>;

  /** A missing object at `key` is not an error — deletion is idempotent. */
  deleteObject(key: string): Promise<void>;

  /**
   * Optional time-limited URL for direct download. Product default remains
   * permissioned streaming via getObject; do not call this from Artifact
   * business flows unless a use case explicitly needs a signed/direct URL.
   */
  createDownloadUrl(input: DownloadUrlInput): Promise<DownloadUrl>;

  /** Copy within the same container; destination overwrite is allowed. */
  copyObject(input: CopyObjectInput): Promise<ProviderObjectMetadata>;
}
