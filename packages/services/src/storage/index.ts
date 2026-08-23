/**
 * Storage domain barrel — owns storage_objects business state (auth +
 * pending→uploaded→verified). Local provider for dev/test; staging/prod
 * use STORAGE_PROVIDER=s3.
 * Package-path re-exports only (Turbopack cannot resolve relative ./x.js
 * from this entry).
 */
export type { QueryExecutor } from "@ai-catalyst/services/internal/transaction";
export type { StorageServiceDependencies } from "@ai-catalyst/services/storage/internal/provider-cache";
export { getStorageObject } from "@ai-catalyst/services/storage/get-object";
export {
  getGeneratedTextContent,
  createPendingGeneratedObject,
  writeGeneratedTextContent,
} from "@ai-catalyst/services/storage/generated-text";
export {
  uploadFile,
  type UploadFileInput,
} from "@ai-catalyst/services/storage/upload";
export { readStorageObjectContent } from "@ai-catalyst/services/storage/read-content";
export { deleteUnverifiedUpload } from "@ai-catalyst/services/storage/delete-upload";
