// Bytes-only contract — a Provider never learns about Workspace, Actor,
// `storage_objects`, or the pending/uploaded/verified/failed/deleted
// state machine. All of that business state lives in index.ts
// (StorageService); a Provider only ever answers "is this exact key
// present, and what does it look like at rest".
//
// Type-only file: nothing here is imported by value, so it's a plain
// relative import from every other file in this directory (index.ts,
// providers/local.ts) without needing its own package.json exports entry
// — see packages/services/src/internal/branch.ts for why *value* imports
// across files in this package need one.

export interface PutObjectInput {
  key: string;
  body: Buffer;
  contentType: string;
}

// The Provider computes/returns what it can verify about what it actually
// wrote (or already holds) at `key` — the Service (index.ts) remains the
// source of truth for what the storage_objects row is allowed to trust,
// and compares this against its own independently-computed hash rather
// than taking a Provider's word for it.
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

  /** Returns `null` (not a throw) when no object exists at `key`. */
  headObject(key: string): Promise<ProviderObjectMetadata | null>;

  /** A missing object at `key` is not an error — deletion is idempotent. */
  deleteObject(key: string): Promise<void>;
}
