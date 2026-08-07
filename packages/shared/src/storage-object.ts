// Mirrors the `storage_objects.upload_status` check constraint in
// infra/database/migrations/0001_aidb_v5_baseline.sql.
export type StorageObjectUploadStatus =
  "pending" | "uploaded" | "verified" | "failed" | "deleted";

// External DTO — always JSON-safe (ISO string timestamps, never `Date`),
// same convention as `ProgramRun`/`Venture`. Mapped once at the Service
// boundary (packages/services/src/storage/index.ts). Deliberately a
// curated subset of the `storage_objects` columns — internal-only columns
// (storage_provider, storage_container, owner_user_id, created_via, etc.)
// never cross this boundary just because a query forgot to name its
// columns explicitly.
export interface StorageObject {
  id: string;
  workspaceId: string | null;
  objectKey: string;
  filename: string;
  contentType: string;
  sizeBytes: number | null;
  sha256: string | null;
  uploadStatus: StorageObjectUploadStatus;
  uploadedAt: string | null;
  verifiedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}
