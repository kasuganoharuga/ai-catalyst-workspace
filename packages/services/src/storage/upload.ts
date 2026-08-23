import { randomUUID } from "node:crypto";

import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type { StorageObject } from "@ai-catalyst/shared";

import { ServiceError } from "@ai-catalyst/services/errors";
import { resolveFounderWorkspace } from "@ai-catalyst/services/workspace";
import { withTransaction } from "@ai-catalyst/services/internal/transaction";
import {
  generateObjectKey,
  sanitizeFilename,
} from "@ai-catalyst/services/storage/internal/object-key";
import {
  assertPrepUploadSizeWithinLimit,
  resolvePrepUploadContentType,
} from "@ai-catalyst/services/storage/internal/upload-validation";
import { sha256 } from "@ai-catalyst/services/storage/internal/hash";
import { assertFounderOrSystemActor } from "@ai-catalyst/services/storage/internal/authorization";
import {
  STORAGE_OBJECT_COLUMNS,
  mapStorageObjectRow,
  markFailed,
  resolveStorageCreatedVia,
  type StorageObjectRow,
} from "@ai-catalyst/services/storage/internal/rows";
import {
  activeStorageIdentity,
  resolveProvider,
  type StorageServiceDependencies,
} from "@ai-catalyst/services/storage/internal/provider-cache";

export interface UploadFileInput {
  workspaceId: string;
  filename: string;
  /** Untrusted browser-supplied MIME type; checked against the allowlist. */
  contentType: string;
  content: Buffer;
}

/**
 * Store a Founder-supplied file in one call: create the row, write the
 * bytes, verify them.
 *
 * Deliberately not split into create-then-write the way generated text is.
 * That pair exists because Claude asks for an id, then streams content it
 * is still composing. A browser upload arrives whole, so a two-call shape
 * would only add a way to leave pending rows behind when the second call
 * never comes.
 *
 * The provider write still happens outside any Postgres transaction, and
 * the row still walks pending → uploaded → verified, so a crash midway
 * leaves the same recoverable states as the generated path rather than a
 * row claiming content that was never stored.
 */
export async function uploadFile(
  actor: ActorContext,
  input: UploadFileInput,
  deps: StorageServiceDependencies = {},
): Promise<StorageObject> {
  assertFounderOrSystemActor(actor);

  // Both validated before anything is inserted, so a rejected file never
  // leaves a pending row behind.
  assertPrepUploadSizeWithinLimit(input.content);
  const contentType = resolvePrepUploadContentType(
    input.contentType,
    input.filename,
  );
  const contentHash = sha256(input.content);

  await resolveProvider(deps);
  const identity = activeStorageIdentity(deps);

  const pendingRow = await withTransaction(async (client) => {
    let resolvedWorkspaceId: string;
    if (actor.source === "system") {
      resolvedWorkspaceId = input.workspaceId;
    } else {
      const workspace = await resolveFounderWorkspace(actor, client);
      if (workspace.id !== input.workspaceId) {
        throw new ServiceError("NOT_FOUND", "Workspace not found.");
      }
      resolvedWorkspaceId = workspace.id;
    }

    const storageObjectId = randomUUID();
    const objectKey = generateObjectKey({
      workspaceId: resolvedWorkspaceId,
      storageObjectId,
      filename: input.filename,
    });

    const result = await client.query<StorageObjectRow>(
      `insert into storage_objects (
         id, workspace_id, storage_provider, storage_container, object_key,
         original_filename, content_type, upload_status, created_via,
         uploaded_by_user_id
       )
       values ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9)
       returning ${STORAGE_OBJECT_COLUMNS}`,
      [
        storageObjectId,
        resolvedWorkspaceId,
        identity.provider,
        identity.container,
        objectKey,
        sanitizeFilename(input.filename),
        contentType,
        resolveStorageCreatedVia(actor),
        actor.userId,
      ],
    );
    return result.rows[0];
  });

  try {
    await resolveProvider(deps).then((p) =>
      p.putObject({
        key: pendingRow.object_key,
        body: input.content,
        contentType,
      }),
    );
  } catch (error) {
    await markFailed(pendingRow.id);
    throw new ServiceError(
      "STORAGE_OBJECT_NOT_WRITABLE",
      `Failed to write uploaded file: ${(error as Error).message}`,
    );
  }

  await withTransaction(async (client) => {
    await client.query(
      `update storage_objects
       set upload_status = 'uploaded', size_bytes = $2, checksum_sha256 = $3,
           uploaded_at = now(), updated_at = now()
       where id = $1`,
      [pendingRow.id, input.content.byteLength, contentHash],
    );
  });

  // Read back from the provider rather than trusting the write returned
  // cleanly — the same guard the generated path uses, and the reason an
  // object never reaches 'verified' on a silently truncated write.
  const stored = await resolveProvider(deps).then((p) =>
    p.headObject(pendingRow.object_key),
  );
  if (stored === null || stored.sha256 !== contentHash) {
    await markFailed(pendingRow.id);
    throw new ServiceError(
      "STORAGE_OBJECT_NOT_WRITABLE",
      "Uploaded file could not be verified after writing; it was not stored.",
    );
  }

  const verifiedRow = await withTransaction(async (client) => {
    const result = await client.query<StorageObjectRow>(
      `update storage_objects
       set upload_status = 'verified', verified_at = now(), updated_at = now()
       where id = $1
       returning ${STORAGE_OBJECT_COLUMNS}`,
      [pendingRow.id],
    );
    return result.rows[0];
  });

  return mapStorageObjectRow(verifiedRow);
}
