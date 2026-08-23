import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type { StorageObject } from "@ai-catalyst/shared";

import { ServiceError } from "@ai-catalyst/services/errors";
import { withTransaction } from "@ai-catalyst/services/internal/transaction";
import { assertFounderOrSystemActor } from "@ai-catalyst/services/storage/internal/authorization";
import {
  STORAGE_OBJECT_COLUMNS,
  fetchStorageObjectRow,
  loadAuthorizedStorageObject,
  mapStorageObjectRow,
  type StorageObjectRow,
} from "@ai-catalyst/services/storage/internal/rows";
import { normalizeDeleteUnverifiedUploadInput } from "@ai-catalyst/services/storage/internal/normalize-input";
import {
  resolveProvider,
  type StorageServiceDependencies,
} from "@ai-catalyst/services/storage/internal/provider-cache";

/**
 * Soft-delete unfinished uploads (upload_status='deleted') — never physical DELETE;
 * verified objects are immutable via this API.
 */
export async function deleteUnverifiedUpload(
  actor: ActorContext,
  input: unknown,
  deps: StorageServiceDependencies = {},
): Promise<StorageObject> {
  assertFounderOrSystemActor(actor);
  const { storageObjectId } = normalizeDeleteUnverifiedUploadInput(input);

  const lockedRow = await withTransaction((client) =>
    loadAuthorizedStorageObject(actor, storageObjectId, client, {
      forUpdate: true,
    }),
  );

  if (lockedRow.upload_status === "deleted") {
    // Idempotent success — never rewrites deleted_at, never calls the
    // Provider again.
    return mapStorageObjectRow(lockedRow);
  }

  if (lockedRow.upload_status === "verified") {
    throw new ServiceError(
      "STORAGE_OBJECT_NOT_DELETABLE",
      "A verified Storage Object cannot be deleted through this API.",
    );
  }

  // 'pending' | 'uploaded' | 'failed' — best-effort Provider delete
  // (a missing provider object is not an error) happens with no Postgres
  // transaction held open, same "no I/O inside a transaction" rule as
  // writeGeneratedTextContent.
  const provider = await resolveProvider(deps);
  await provider.deleteObject(lockedRow.object_key);

  const deletedRow = await withTransaction(async (client) => {
    const reloaded = await fetchStorageObjectRow(client, lockedRow.id, {
      forUpdate: true,
    });
    if (!reloaded) {
      throw new ServiceError("NOT_FOUND", "Storage object not found.");
    }
    // Re-checked after re-acquiring the lock: a concurrent delete call
    // could have already finished between our two transactions above.
    if (reloaded.upload_status === "deleted") {
      return reloaded;
    }
    const result = await client.query<StorageObjectRow>(
      `update storage_objects
       set upload_status = 'deleted', deleted_at = now(), updated_at = now()
       where id = $1
       returning ${STORAGE_OBJECT_COLUMNS}`,
      [reloaded.id],
    );
    return result.rows[0];
  });

  return mapStorageObjectRow(deletedRow);
}
