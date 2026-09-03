import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type { StorageObject } from "@ai-catalyst/shared";

import { assertFounderOrSystemActor } from "@ai-catalyst/services/storage/internal/authorization";
import {
  loadAuthorizedStorageObject,
  mapStorageObjectRow,
} from "@ai-catalyst/services/storage/internal/rows";

/**
 * Workspace-scoped read by id — same authorization as write paths.
 */
export async function getStorageObject(
  actor: ActorContext,
  storageObjectId: string,
): Promise<StorageObject> {
  assertFounderOrSystemActor(actor);
  const row = await loadAuthorizedStorageObject(actor, storageObjectId, pool, {
    forUpdate: false,
  });
  return mapStorageObjectRow(row);
}
