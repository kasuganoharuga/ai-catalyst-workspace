import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type { StorageObject, StorageObjectUploadStatus } from "@ai-catalyst/shared";

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
import { LocalStorageProvider } from "@ai-catalyst/services/storage/providers/local";

import type { StorageProvider } from "./types.js";

// ACCEPTANCE NOTE (read before wiring this into 2.6/2.7/2.9):
//
// The Local Provider this Service defaults to
// (storage/providers/local.ts) currently only guarantees
// single-process/test-suite usability. It does NOT yet provide
// cross-container (web/mcp) shared local file access under `docker:up` —
// infra/docker/docker-compose.yml declares a named volume +
// LOCAL_STORAGE_ROOT convention for it, but nothing exercises real
// concurrent multi-container access. That requires either 2.10's move to
// an S3-compatible provider, or a follow-up PR that actually wires a
// shared bind mount into a running container.
//
// This module owns Storage Object business state (storage_objects rows,
// authorization, the pending → uploaded → verified transaction
// choreography) — apps/web and apps/mcp are both thin shells that call
// into this same Service, never re-implement any of this (architecture.mdc
// rule 1). The status column on storage_objects is `upload_status`
// (never `status`) everywhere in this file, on purpose — see the
// 0001_aidb_v5_baseline.sql check constraint.

export type QueryExecutor = Pool | PoolClient;

export interface StorageServiceDependencies {
  // Test-only seam: production always uses the real LocalStorageProvider
  // (created lazily so nothing touches the filesystem at import time).
  // Lets tests substitute a fake StorageProvider to deterministically
  // exercise failure paths (Provider I/O throwing, an object that never
  // becomes visible via headObject) that are otherwise a real race
  // against the real filesystem — same DI pattern as
  // module/catalog.ts's ModuleCatalogDependencies.
  provider?: StorageProvider;
}

let defaultProvider: StorageProvider | null = null;
function resolveProvider(deps: StorageServiceDependencies): StorageProvider {
  if (deps.provider) {
    return deps.provider;
  }
  if (!defaultProvider) {
    defaultProvider = new LocalStorageProvider();
  }
  return defaultProvider;
}

// DEVIATION from the plan's literal pseudocode, documented here because
// it's load-bearing for every public function below: the plan writes
// `assertRole(actor, ["founder", "system"])`, but `ActorRole` (in the
// unmodified packages/contracts/src/actor-context.ts — both this PR and
// PR 2.4 are explicitly barred from touching that file) is only
// `"pending" | "founder" | "mentor" | "admin"`. `"system"` is an
// `ActorSource` value, not a role — `assertRole`'s `allowed: ActorRole[]`
// parameter cannot express it, and `["founder", "system"]` does not
// type-check as an `ActorRole[]` literal. The intended authorization
// ("Founder actors, and trusted system-sourced callers, may call this")
// is instead expressed directly against both fields: a Founder actor
// passes on `role`; a system-sourced caller (any role, since a
// server-side generation flow has no Founder session to carry) passes on
// `source`. Every other actor is FORBIDDEN, matching assertRole's own
// error shape.
function assertFounderOrSystemActor(actor: ActorContext): void {
  if (actor.role === "founder" || actor.source === "system") {
    return;
  }
  throw new ServiceError(
    "FORBIDDEN",
    "You do not have permission to perform this action.",
  );
}

// V1 hardcodes both of these — see the schema's own column comment for
// storage_provider ("local" for dev/test, "s3" for production) and
// storage_container ("local-development" is the documented local
// convention). 2.10's S3-compatible provider swap is expected to make
// this a real per-environment decision, not a constant.
const STORAGE_PROVIDER = "local";
const STORAGE_CONTAINER = "local-development";

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

// V1 has exactly one AI client (the Claude Remote MCP server, per
// architecture.mdc) — this mapper is deliberately local to this file
// (only createPendingGeneratedObject/writeGeneratedTextContent need it),
// not a shared cross-PR module: PR 2.4's own
// attempt/internal/interaction-provider.ts solves the analogous problem
// for module_responses.source_provider, but the two PRs must not import
// from each other (2.4's `attempt` module may not exist yet when this
// file's tests run on this branch in isolation).
function resolveStorageCreatedVia(
  actor: ActorContext,
): "website" | "claude" | "system" {
  if (actor.source === "system") {
    return "system";
  }
  if (actor.source === "mcp") {
    // Hardcoded until a second AI client exists — see the equivalent
    // comment in PR 2.4's resolveInteractionProvider for the full
    // reasoning; the same constraint applies here.
    return "claude";
  }
  // "web", or unset — every pre-2.2 ActorContext test fixture across this
  // package omits `source` entirely and is always a web-originated
  // Founder actor in practice.
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

// system actors are trusted to state their target Workspace directly (no
// further check is possible — there is no "system's own Workspace" to
// compare against); a founder actor's own reachable Workspace is always
// resolved and compared, so a cross-Workspace storageObjectId (or a
// cross-Workspace target workspaceId on create) reads as NOT_FOUND, never
// a distinguishable FORBIDDEN — same enumeration-safety convention as
// venture/index.ts.
async function loadAuthorizedStorageObject(
  actor: ActorContext,
  storageObjectId: string,
  executor: QueryExecutor,
  options: { forUpdate: boolean },
): Promise<StorageObjectRow> {
  const id = parseEntityIdOrNotFound(storageObjectId, "Storage object not found.");
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
 * Internal read helper (also usable by tests/future callers) — fetches a
 * StorageObject by id with the same Workspace-scoped authorization every
 * write path uses.
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

// Deliberately its OWN assertion, not a reuse of assertFounderOrSystemActor
// — that shared gate (and loadAuthorizedStorageObject's workspace check,
// which unconditionally calls resolveFounderWorkspace for every
// non-system actor) has no admin case at all: resolveFounderWorkspace
// itself starts with assertRole(actor, ["founder"]), so an admin-role
// actor throws FORBIDDEN there today. Widening the shared helpers would
// also open every WRITE path (createPendingGeneratedObject,
// writeGeneratedTextContent, deleteUnverifiedUpload) to admin, which is
// not what's needed — only a read path, for PR 2.6's runOfficialValidation
// (which runs as a system or admin actor and must be able to read any
// Workspace's Artifact content) needs this.
function assertGeneratedContentReader(actor: ActorContext): void {
  if (actor.role === "founder" || actor.role === "admin" || actor.source === "system") {
    return;
  }
  throw new ServiceError(
    "FORBIDDEN",
    "You do not have permission to perform this action.",
  );
}

/**
 * Reads back the verified content of a generated-text Storage Object as
 * a UTF-8 string — the only entry point PR 2.6's Validators use to read
 * a saved Artifact's Markdown. founder actors are Workspace-scoped (same
 * check every other path uses); system/admin actors are trusted across
 * any Workspace, matching runOfficialValidation's own permission matrix
 * (there is no "system's own Workspace" or "admin's own Workspace" to
 * compare against, same reasoning as loadAuthorizedStorageObject's system
 * branch).
 */
export async function getGeneratedTextContent(
  actor: ActorContext,
  storageObjectId: string,
  deps: StorageServiceDependencies = {},
): Promise<string> {
  assertGeneratedContentReader(actor);
  const id = parseEntityIdOrNotFound(storageObjectId, "Storage object not found.");
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

  if (row.upload_status !== "verified") {
    // Only reachable if a caller passes a storageObjectId that was never
    // taken through writeGeneratedTextContent's verified transition —
    // every artifact_files row this Service links to a submission is
    // created only after 'verified' (see artifact/index.ts's
    // saveArtifactSubmission), so this is a deployment/caller bug, not a
    // normal business state.
    throw new ServiceError(
      "INTERNAL_INVARIANT_ERROR",
      `Storage object ${row.id} is "${row.upload_status}", not "verified" — only a verified object's content can be read.`,
    );
  }

  const provider = resolveProvider(deps);
  const buffer = await provider.getObject(row.object_key);
  return buffer.toString("utf8");
}

/**
 * Transaction A: inserts a `storage_objects` row in `upload_status =
 * 'pending'` and returns its stable id — this id is what
 * writeGeneratedTextContent's retry/idempotency semantics key off of.
 * `contentType` is not a caller parameter: V1 hardcodes generated text to
 * `GENERATED_TEXT_CONTENT_TYPE` server-side (a caller-declared MIME type
 * is not trusted any more than a caller-declared byte length is).
 */
export async function createPendingGeneratedObject(
  actor: ActorContext,
  input: unknown,
): Promise<{ id: string }> {
  assertFounderOrSystemActor(actor);
  const { workspaceId, filename } =
    normalizeCreatePendingGeneratedObjectInput(input);

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
        STORAGE_PROVIDER,
        STORAGE_CONTAINER,
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
 * Writes the actual bytes for a pending/retried Storage Object, driving
 * it through the pending → uploaded → verified choreography.
 *
 * Deliberately three independent Postgres transactions (A already ran in
 * createPendingGeneratedObject; B and C below) with uncommitted Provider
 * I/O in between each — a Postgres transaction is never held open across
 * a disk/network call:
 *
 *   B: lock the row, write real size/hash, upload_status = 'uploaded'.
 *   (Provider I/O, no transaction): re-fetch what was actually written.
 *   C: lock the row again, upload_status = 'verified'.
 *
 * Idempotency/retry is keyed on (storageObjectId, content hash) — see
 * the branches below, matching the plan's rules exactly: same id + same
 * hash resumes/no-ops forward; same id + different hash conflicts; a
 * dead (`failed`/`deleted`) row is never resurrected.
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

  const provider = resolveProvider(deps);

  // Orphan-recovery check: a prior call may have completed the Provider
  // write but failed before transaction B recorded it (see the module
  // comment above) — headObject tells us whether the bytes are already
  // there with the right hash, so a retry never re-does I/O it doesn't
  // need to.
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
 * Soft-deletes an unfinished (never `verified`) upload. Never a physical
 * `delete from storage_objects` — the schema already carries
 * `upload_status = 'deleted'` + `deleted_at` for exactly this, and the
 * app's DB role is expected to lose DELETE grants on core tables in a
 * later iteration (4.5), so this code path must not depend on having
 * that privilege at all.
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
  const provider = resolveProvider(deps);
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
