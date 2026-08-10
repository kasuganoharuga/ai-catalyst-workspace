import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";

import { pool } from "@ai-catalyst/db";
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
  generateObjectKey,
  sanitizeFilename,
} from "@ai-catalyst/services/storage/internal/object-key";
import {
  GENERATED_TEXT_CONTENT_TYPE,
  assertGeneratedTextSizeWithinLimit,
} from "@ai-catalyst/services/storage/internal/validation";
import { sha256 } from "@ai-catalyst/services/storage/internal/hash";
import {
  loadStorageConfigFromEnv,
  storageIdentityFromConfig,
  type StorageConfig,
} from "@ai-catalyst/services/storage/config";
import { resolveProvider as resolveProviderFromConfig } from "@ai-catalyst/services/storage/resolve-provider";

import type { StorageProvider } from "./types.js";

// Owns storage_objects business state (auth + pending→uploaded→verified).
// Local provider for dev/test; staging/prod use STORAGE_PROVIDER=s3.

export type QueryExecutor = Pool | PoolClient;

export interface StorageServiceDependencies {
  // Test-only DI seam for a fake StorageProvider (same pattern as ModuleCatalogDependencies).
  provider?: StorageProvider;
  /** Override config used when `provider` is omitted (tests / custom roots). */
  storageConfig?: StorageConfig;
}

let defaultProvider: StorageProvider | null = null;
let defaultConfig: StorageConfig | null = null;
let defaultProviderPromise: Promise<StorageProvider> | null = null;

async function resolveProvider(
  deps: StorageServiceDependencies,
): Promise<StorageProvider> {
  if (deps.provider) {
    return deps.provider;
  }
  if (deps.storageConfig) {
    return resolveProviderFromConfig(deps.storageConfig);
  }
  if (defaultProvider) {
    return defaultProvider;
  }
  if (!defaultProviderPromise) {
    defaultProviderPromise = (async () => {
      defaultConfig = await loadStorageConfigFromEnv();
      defaultProvider = resolveProviderFromConfig(defaultConfig);
      return defaultProvider;
    })();
  }
  return defaultProviderPromise;
}

function activeStorageIdentity(deps: StorageServiceDependencies): {
  provider: "local" | "s3";
  container: string;
} {
  if (deps.storageConfig) {
    return storageIdentityFromConfig(deps.storageConfig);
  }
  if (defaultConfig) {
    return storageIdentityFromConfig(defaultConfig);
  }
  // Before the lazy default provider has loaded, persist the local
  // convention (matches prior hardcoded constants and CI/default envs).
  return { provider: "local", container: "local-development" };
}

// Founders pass on `role`; trusted system callers pass on `source`.
// `"system"` is an ActorSource, not an ActorRole, so this cannot be
// expressed as assertRole(["founder", "system"]).
function assertFounderOrSystemActor(actor: ActorContext): void {
  if (actor.role === "founder" || actor.source === "system") {
    return;
  }
  throw new ServiceError(
    "FORBIDDEN",
    "You do not have permission to perform this action.",
  );
}

const WRITABLE_UPLOAD_STATUSES: readonly StorageObjectUploadStatus[] = [
  "pending",
  "uploaded",
];

const STORAGE_OBJECT_COLUMNS = `
  id, workspace_id, object_key, original_filename, content_type,
  size_bytes, checksum_sha256, upload_status, uploaded_at, verified_at,
  deleted_at, created_at
`;

interface StorageObjectRow {
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

function mapStorageObjectRow(row: StorageObjectRow): StorageObject {
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
function resolveStorageCreatedVia(
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

function normalizeCreatePendingGeneratedObjectInput(input: unknown): {
  workspaceId: string;
  filename: string;
} {
  if (typeof input !== "object" || input === null) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "workspaceId and filename are required.",
    );
  }
  const { workspaceId, filename } = input as {
    workspaceId?: unknown;
    filename?: unknown;
  };
  if (typeof workspaceId !== "string" || workspaceId.trim().length === 0) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "workspaceId must be a non-blank string.",
    );
  }
  if (typeof filename !== "string" || filename.trim().length === 0) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "filename must be a non-blank string.",
    );
  }
  return { workspaceId, filename };
}

function normalizeWriteGeneratedTextContentInput(input: unknown): {
  storageObjectId: string;
  content: string;
} {
  if (typeof input !== "object" || input === null) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "storageObjectId and content are required.",
    );
  }
  const { storageObjectId, content } = input as {
    storageObjectId?: unknown;
    content?: unknown;
  };
  if (
    typeof storageObjectId !== "string" ||
    storageObjectId.trim().length === 0
  ) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "storageObjectId must be a non-blank string.",
    );
  }
  if (typeof content !== "string") {
    throw new ServiceError("VALIDATION_ERROR", "content must be a string.");
  }
  return { storageObjectId, content };
}

function normalizeDeleteUnverifiedUploadInput(input: unknown): {
  storageObjectId: string;
} {
  if (typeof input !== "object" || input === null) {
    throw new ServiceError("VALIDATION_ERROR", "storageObjectId is required.");
  }
  const { storageObjectId } = input as { storageObjectId?: unknown };
  if (
    typeof storageObjectId !== "string" ||
    storageObjectId.trim().length === 0
  ) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "storageObjectId must be a non-blank string.",
    );
  }
  return { storageObjectId };
}

async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function fetchStorageObjectRow(
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
async function loadAuthorizedStorageObject(
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

// Read gate: founder/mentor/admin/system; writes stay founder/system-only.
function assertGeneratedContentReader(actor: ActorContext): void {
  if (
    actor.role === "founder" ||
    actor.role === "mentor" ||
    actor.role === "admin" ||
    actor.source === "system"
  ) {
    return;
  }
  throw new ServiceError(
    "FORBIDDEN",
    "You do not have permission to perform this action.",
  );
}

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

  if (actor.role === "founder") {
    const workspace = await resolveFounderWorkspace(actor, pool);
    if (row.workspace_id !== workspace.id) {
      throw new ServiceError("NOT_FOUND", "Storage object not found.");
    }
  }

  // Single choke point for artefact bytes — mentor scope enforced here as NOT_FOUND.
  if (actor.role === "mentor") {
    const mentored = await pool.query(
      `select 1 from workspaces where id = $1 and mentor_user_id = $2`,
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

async function markFailed(id: string): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `update storage_objects
       set upload_status = 'failed', updated_at = now()
       where id = $1`,
      [id],
    );
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
  if (!WRITABLE_UPLOAD_STATUSES.includes(initialRow.upload_status)) {
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
