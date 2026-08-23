import { randomUUID } from "node:crypto";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { effectiveRole } from "@ai-catalyst/contracts/actor-context";
import type { StorageObject } from "@ai-catalyst/shared";

import { ServiceError } from "@ai-catalyst/services/errors";
import { resolveFounderWorkspace } from "@ai-catalyst/services/workspace";
import { parseEntityIdOrNotFound } from "@ai-catalyst/services/internal/entity-id";
import { MENTOR_SEES_ALL_FOUNDERS } from "@ai-catalyst/services/internal/mentor-scope";
import { withTransaction } from "@ai-catalyst/services/internal/transaction";
import {
  generateObjectKey,
  sanitizeFilename,
} from "@ai-catalyst/services/storage/internal/object-key";
import {
  GENERATED_TEXT_CONTENT_TYPE,
  assertGeneratedTextSizeWithinLimit,
} from "@ai-catalyst/services/storage/internal/validation";
import { sha256 } from "@ai-catalyst/services/storage/internal/hash";
import {
  assertFounderOrSystemActor,
  assertGeneratedContentReader,
} from "@ai-catalyst/services/storage/internal/authorization";
import {
  STORAGE_OBJECT_COLUMNS,
  WRITABLE_UPLOAD_STATUSES,
  fetchStorageObjectRow,
  loadAuthorizedStorageObject,
  mapStorageObjectRow,
  markFailed,
  resolveStorageCreatedVia,
  type StorageObjectRow,
} from "@ai-catalyst/services/storage/internal/rows";
import {
  normalizeCreatePendingGeneratedObjectInput,
  normalizeWriteGeneratedTextContentInput,
} from "@ai-catalyst/services/storage/internal/normalize-input";
import {
  activeStorageIdentity,
  resolveProvider,
  type StorageServiceDependencies,
} from "@ai-catalyst/services/storage/internal/provider-cache";

/**
 * Reads verified generated-text content as UTF-8. Founders are scoped to
 * their own Workspace and Mentors to the Workspaces they cover; system/admin
 * actors may read any workspace (used by official validation).
 */
export async function getGeneratedTextContent(
  actor: ActorContext,
  storageObjectId: string,
  deps: StorageServiceDependencies = {},
): Promise<string> {
  assertGeneratedContentReader(actor);
  const id = parseEntityIdOrNotFound(
    storageObjectId,
    "Storage object not found.",
  );
  const row = await fetchStorageObjectRow(pool, id, { forUpdate: false });
  if (!row) {
    throw new ServiceError("NOT_FOUND", "Storage object not found.");
  }

  // effectiveRole, not actor.role: a Mentor previewing the Founder flow in
  // their own sandbox must read its content through this same branch (via
  // resolveFounderWorkspace, scoped to their real userId) — the mentor
  // branch below excludes sandboxes by kind = 'live' and would otherwise
  // wrongly NOT_FOUND them out of their own sandbox's content. Written as
  // if/else because actor.role === "mentor" alone is not "not currently
  // previewing" — see effectiveRole()'s docstring.
  if (effectiveRole(actor) === "founder") {
    const workspace = await resolveFounderWorkspace(actor, pool);
    if (row.workspace_id !== workspace.id) {
      throw new ServiceError("NOT_FOUND", "Storage object not found.");
    }
  } else if (actor.role === "mentor") {
    // Single choke point for artefact bytes — mentor scope enforced here as
    // NOT_FOUND, independently of the mentor/index.ts checks (this path is
    // also reachable directly, e.g. from official validation call sites).
    // kind = 'live' excludes a Mentor's own founder-preview sandbox — see
    // mentor/index.ts's assertMentorOwnsWorkspace for the same filter.
    const mentored = MENTOR_SEES_ALL_FOUNDERS
      ? await pool.query(
          `select 1 from workspaces where id = $1 and kind = 'live'`,
          [row.workspace_id],
        )
      : await pool.query(
          `select 1 from workspaces where id = $1 and mentor_user_id = $2 and kind = 'live'`,
          [row.workspace_id, actor.userId],
        );
    if (mentored.rowCount === 0) {
      throw new ServiceError("NOT_FOUND", "Storage object not found.");
    }
  }

  if (row.upload_status !== "verified") {
    // Caller bug if not verified — artifact_files only link post-verified submissions.
    throw new ServiceError(
      "INTERNAL_INVARIANT_ERROR",
      `Storage object ${row.id} is "${row.upload_status}", not "verified" — only a verified object's content can be read.`,
    );
  }

  const provider = await resolveProvider(deps);
  const buffer = await provider.getObject(row.object_key);
  return buffer.toString("utf8");
}

/**
 * Transaction A: insert pending row; id keys writeGeneratedTextContent retries.
 * contentType is server-fixed — caller MIME is not trusted.
 */
export async function createPendingGeneratedObject(
  actor: ActorContext,
  input: unknown,
  deps: StorageServiceDependencies = {},
): Promise<{ id: string }> {
  assertFounderOrSystemActor(actor);
  const { workspaceId, filename } =
    normalizeCreatePendingGeneratedObjectInput(input);
  // Ensure the default provider (and its config) is warm so
  // storage_provider / storage_container match the active StorageConfig.
  await resolveProvider(deps);
  const identity = activeStorageIdentity(deps);

  return withTransaction(async (client) => {
    let resolvedWorkspaceId: string;
    if (actor.source === "system") {
      resolvedWorkspaceId = workspaceId;
    } else {
      const workspace = await resolveFounderWorkspace(actor, client);
      if (workspace.id !== workspaceId) {
        throw new ServiceError("NOT_FOUND", "Workspace not found.");
      }
      resolvedWorkspaceId = workspace.id;
    }

    const storageObjectId = randomUUID();
    const objectKey = generateObjectKey({
      workspaceId: resolvedWorkspaceId,
      storageObjectId,
      filename,
    });
    const sanitizedFilename = sanitizeFilename(filename);
    const createdVia = resolveStorageCreatedVia(actor);

    const result = await client.query<{ id: string }>(
      `insert into storage_objects (
         id, workspace_id, storage_provider, storage_container, object_key,
         original_filename, content_type, upload_status, created_via
       )
       values ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)
       returning id`,
      [
        storageObjectId,
        resolvedWorkspaceId,
        identity.provider,
        identity.container,
        objectKey,
        sanitizedFilename,
        GENERATED_TEXT_CONTENT_TYPE,
        createdVia,
      ],
    );

    return { id: result.rows[0].id };
  });
}

/**
 * Write bytes through pending→uploaded→verified in separate transactions
 * (no Postgres txn across provider I/O). Idempotent on (storageObjectId, hash).
 */
export async function writeGeneratedTextContent(
  actor: ActorContext,
  input: unknown,
  deps: StorageServiceDependencies = {},
): Promise<StorageObject> {
  assertFounderOrSystemActor(actor);
  const { storageObjectId, content } =
    normalizeWriteGeneratedTextContentInput(input);

  // Validated before the row is even loaded — an oversized request never
  // touches the database at all, matching createPendingGeneratedObject's
  // already-created pending row staying completely untouched.
  const contentBuffer = Buffer.from(content, "utf8");
  assertGeneratedTextSizeWithinLimit(contentBuffer);
  const contentHash = sha256(contentBuffer);

  const initialRow = await withTransaction((client) =>
    loadAuthorizedStorageObject(actor, storageObjectId, client, {
      forUpdate: true,
    }),
  );

  if (initialRow.upload_status === "verified") {
    if (initialRow.checksum_sha256 === contentHash) {
      return mapStorageObjectRow(initialRow);
    }
    throw new ServiceError(
      "STORAGE_CONTENT_CONFLICT",
      "This Storage Object was already verified with different content.",
    );
  }

  if (
    initialRow.upload_status === "failed" ||
    initialRow.upload_status === "deleted"
  ) {
    throw new ServiceError(
      "STORAGE_OBJECT_NOT_WRITABLE",
      `Storage Object is "${initialRow.upload_status}" and cannot be written to — call createPendingGeneratedObject again for a fresh id.`,
    );
  }

  // Remaining reachable states here are always 'pending' or 'uploaded'
  // (WRITABLE_UPLOAD_STATUSES) — asserted defensively so a future new
  // upload_status value fails loudly here instead of silently falling
  // through to the write path below.
  if (
    !(WRITABLE_UPLOAD_STATUSES as readonly string[]).includes(
      initialRow.upload_status,
    )
  ) {
    throw new ServiceError(
      "INTERNAL_INVARIANT_ERROR",
      `Unexpected upload_status "${initialRow.upload_status}" reached writeGeneratedTextContent.`,
    );
  }

  if (
    initialRow.checksum_sha256 !== null &&
    initialRow.checksum_sha256 !== contentHash
  ) {
    throw new ServiceError(
      "STORAGE_CONTENT_CONFLICT",
      "This Storage Object already has different content recorded for it.",
    );
  }

  const provider = await resolveProvider(deps);

  // Orphan recovery: prior call may have written provider bytes before txn B recorded them.
  const existingProviderObject = await provider.headObject(
    initialRow.object_key,
  );
  const needsWrite =
    existingProviderObject === null ||
    existingProviderObject.sha256 !== contentHash;

  if (needsWrite) {
    try {
      await provider.putObject({
        key: initialRow.object_key,
        body: contentBuffer,
        contentType: initialRow.content_type,
      });
    } catch (error) {
      await markFailed(initialRow.id);
      throw new ServiceError(
        "STORAGE_OBJECT_NOT_WRITABLE",
        `Failed to write Storage Object content: ${(error as Error).message}`,
      );
    }
  }

  const uploadedRow = await withTransaction(async (client) => {
    const result = await client.query<StorageObjectRow>(
      `update storage_objects
       set upload_status = 'uploaded',
           size_bytes = $2,
           checksum_sha256 = $3,
           uploaded_at = coalesce(uploaded_at, now()),
           uploaded_by_user_id = $4,
           updated_at = now()
       where id = $1
       returning ${STORAGE_OBJECT_COLUMNS}`,
      [initialRow.id, contentBuffer.byteLength, contentHash, actor.userId],
    );
    return result.rows[0];
  });

  const verifiedProviderObject = await provider.headObject(
    uploadedRow.object_key,
  );
  if (
    verifiedProviderObject === null ||
    verifiedProviderObject.sha256 !== contentHash
  ) {
    await markFailed(uploadedRow.id);
    throw new ServiceError(
      "STORAGE_OBJECT_NOT_WRITABLE",
      "Storage Object content could not be verified after upload; the object never reached 'verified'.",
    );
  }

  const verifiedRow = await withTransaction(async (client) => {
    const result = await client.query<StorageObjectRow>(
      `update storage_objects
       set upload_status = 'verified', verified_at = now(), updated_at = now()
       where id = $1
       returning ${STORAGE_OBJECT_COLUMNS}`,
      [uploadedRow.id],
    );
    return result.rows[0];
  });

  return mapStorageObjectRow(verifiedRow);
}
