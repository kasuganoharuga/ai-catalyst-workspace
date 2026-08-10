// Bytes-only provider contract: no Workspace/Actor/`storage_objects`
// awareness. Business state lives in StorageService (index.ts).
// Downloads default to getObject (stream through backend);
// createDownloadUrl is optional and must not be required by callers.

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
  /** Atomic put at final key — partial objects never visible; verified immutability is above this layer. */
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

  /** Optional signed URL — product default is permissioned getObject streaming. */
  createDownloadUrl(input: DownloadUrlInput): Promise<DownloadUrl>;

  /** Copy within the same container; destination overwrite is allowed. */
  copyObject(input: CopyObjectInput): Promise<ProviderObjectMetadata>;
}
