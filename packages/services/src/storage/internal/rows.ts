import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { resolveMcpProviderTag } from "@ai-catalyst/contracts/actor-context";
import type {
  StorageObject,
  StorageObjectUploadStatus,
} from "@ai-catalyst/shared";

import { ServiceError } from "@ai-catalyst/services/errors";
import { resolveFounderWorkspace } from "@ai-catalyst/services/workspace";
import { parseEntityIdOrNotFound } from "@ai-catalyst/services/internal/entity-id";
import {
  withTransaction,
  type QueryExecutor,
} from "@ai-catalyst/services/internal/transaction";

export const WRITABLE_UPLOAD_STATUSES: readonly StorageObjectUploadStatus[] = [
  "pending",
  "uploaded",
];

export const STORAGE_OBJECT_COLUMNS = `
  id, workspace_id, object_key, original_filename, content_type,
  size_bytes, checksum_sha256, upload_status, uploaded_at, verified_at,
  deleted_at, created_at
`;

export interface StorageObjectRow {
  id: string;
  workspace_id: string | null;
  object_key: string;
  original_filename: string;
  content_type: string;
  size_bytes: string | null;
  checksum_sha256: string | null;
  upload_status: StorageObjectUploadStatus;
  uploaded_at: Date | null;
  verified_at: Date | null;
  deleted_at: Date | null;
  created_at: Date;
}

export function mapStorageObjectRow(row: StorageObjectRow): StorageObject {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    objectKey: row.object_key,
    filename: row.original_filename,
    contentType: row.content_type,
    // bigint columns come back from `pg` as strings by default — parsed
    // here at the DTO boundary rather than leaking a string-typed
    // "number" field to every caller.
    sizeBytes: row.size_bytes === null ? null : Number(row.size_bytes),
    sha256: row.checksum_sha256,
    uploadStatus: row.upload_status,
    uploadedAt: row.uploaded_at?.toISOString() ?? null,
    verifiedAt: row.verified_at?.toISOString() ?? null,
    deletedAt: row.deleted_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

// Maps ActorContext onto storage_objects.created_via. An mcp-sourced actor
// records which AI client it actually was (resolveMcpProviderTag) — 0011
// added "other" to this column's domain for a client that is neither
// Claude nor ChatGPT.
export function resolveStorageCreatedVia(
  actor: ActorContext,
): "website" | "claude" | "openai" | "other" | "system" {
  if (actor.source === "system") {
    return "system";
  }
  if (actor.source === "mcp") {
    return resolveMcpProviderTag(actor);
  }
  // "web", or unset (common in tests) → website-originated founder.
  return "website";
}

export async function fetchStorageObjectRow(
  executor: QueryExecutor,
  id: string,
  options: { forUpdate: boolean },
): Promise<StorageObjectRow | null> {
  const result = await executor.query<StorageObjectRow>(
    `select ${STORAGE_OBJECT_COLUMNS} from storage_objects
     where id = $1
     ${options.forUpdate ? "for update" : ""}`,
    [id],
  );
  return result.rows[0] ?? null;
}

// system actors state target Workspace directly; founders resolved and compared —
// cross-workspace reads as NOT_FOUND, not FORBIDDEN (enumeration safety).
export async function loadAuthorizedStorageObject(
  actor: ActorContext,
  storageObjectId: string,
  executor: QueryExecutor,
  options: { forUpdate: boolean },
): Promise<StorageObjectRow> {
  const id = parseEntityIdOrNotFound(
    storageObjectId,
    "Storage object not found.",
  );
  const row = await fetchStorageObjectRow(executor, id, options);
  if (!row) {
    throw new ServiceError("NOT_FOUND", "Storage object not found.");
  }

  if (actor.source !== "system") {
    const workspace = await resolveFounderWorkspace(actor, executor);
    if (row.workspace_id !== workspace.id) {
      throw new ServiceError("NOT_FOUND", "Storage object not found.");
    }
  }

  return row;
}

// Shared by generated-text and upload write paths after a provider I/O
// failure. No actor check: the caller has already authorized the object.
export async function markFailed(id: string): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `update storage_objects
       set upload_status = 'failed', updated_at = now()
       where id = $1`,
      [id],
    );
  });
}
