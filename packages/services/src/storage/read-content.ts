import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type { StorageObject } from "@ai-catalyst/shared";

import { ServiceError } from "@ai-catalyst/services/errors";
import { withTransaction } from "@ai-catalyst/services/internal/transaction";
import { assertFounderOrSystemActor } from "@ai-catalyst/services/storage/internal/authorization";
import {
  loadAuthorizedStorageObject,
  mapStorageObjectRow,
} from "@ai-catalyst/services/storage/internal/rows";
import {
  resolveProvider,
  type StorageServiceDependencies,
} from "@ai-catalyst/services/storage/internal/provider-cache";

/** Raw bytes for a verified object the actor is allowed to read. */
export async function readStorageObjectContent(
  actor: ActorContext,
  storageObjectId: string,
  deps: StorageServiceDependencies = {},
): Promise<{ object: StorageObject; content: Buffer }> {
  assertFounderOrSystemActor(actor);
  const row = await withTransaction((client) =>
    loadAuthorizedStorageObject(actor, storageObjectId, client, {
      forUpdate: false,
    }),
  );
  if (row.upload_status !== "verified") {
    throw new ServiceError(
      "NOT_FOUND",
      "This file is not available for reading.",
    );
  }
  const content = await resolveProvider(deps).then((p) =>
    p.getObject(row.object_key),
  );
  return { object: mapStorageObjectRow(row), content };
}
