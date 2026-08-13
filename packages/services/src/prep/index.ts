import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import { resolveFounderWorkspace } from "@ai-catalyst/services/workspace";
import { parseEntityIdOrNotFound } from "@ai-catalyst/services/internal/entity-id";
import {
  readStorageObjectContent,
  uploadFile,
} from "@ai-catalyst/services/storage";

import {
  MAX_PREP_DOCUMENTS_PER_MODULE,
  type PrepDocument,
  type UploadPrepDocumentInput,
} from "@ai-catalyst/services/prep/types";

// Founder-uploaded prep material for a Module's Work step (step 2).
//
// This service owns the join between a program_run_module and the stored
// bytes; storage/ owns the bytes themselves. Nothing here extracts or
// summarises content: the reading client parses the file, so the record
// stays a pointer rather than a second, staler copy of what the file says.

// Explicit column list — never `select *` — so internal columns
// (workspace_id, withdrawn_at, uploaded_by_user_id) never leak into the
// DTO. Two spellings because the reads join storage_objects and need the
// alias, while the insert's `returning` has no alias to qualify.
const PREP_COLUMN_NAMES = `
  id, program_run_module_id, storage_object_id, original_filename,
  content_type, note, created_at
`;
const PREP_COLUMNS = PREP_COLUMN_NAMES.trim()
  .split(/,\s*/)
  .map((column) => `d.${column}`)
  .join(", ");

interface PrepRow {
  id: string;
  program_run_module_id: string;
  storage_object_id: string;
  original_filename: string;
  content_type: string;
  note: string;
  created_at: Date;
  size_bytes: string | null;
}

function mapPrepRow(row: PrepRow): PrepDocument {
  return {
    id: row.id,
    programRunModuleId: row.program_run_module_id,
    storageObjectId: row.storage_object_id,
    filename: row.original_filename,
    contentType: row.content_type,
    // bigint arrives as a string from `pg`; parsed at the DTO boundary.
    sizeBytes: row.size_bytes === null ? null : Number(row.size_bytes),
    note: row.note,
    uploadedAt: row.created_at,
  };
}

/**
 * Resolve the run module and confirm the actor's workspace owns it.
 * Returns the workspace id so callers never re-derive it.
 */
async function authorizeRunModule(
  actor: ActorContext,
  programRunModuleIdRaw: string,
): Promise<{ programRunModuleId: string; workspaceId: string }> {
  assertRole(actor, ["founder"]);
  const programRunModuleId = parseEntityIdOrNotFound(
    programRunModuleIdRaw,
    "Module not found.",
  );
  const workspace = await resolveFounderWorkspace(actor);

  const result = await pool.query<{ id: string }>(
    `select id from program_run_modules where id = $1 and workspace_id = $2`,
    [programRunModuleId, workspace.id],
  );
  if (!result.rows[0]) {
    // Same message whether the row is absent or belongs to another
    // workspace — never confirm existence across a tenant boundary.
    throw new ServiceError("NOT_FOUND", "Module not found.");
  }

  return { programRunModuleId, workspaceId: workspace.id };
}

/** Live (non-withdrawn) prep documents for one Module, oldest first. */
export async function listPrepDocuments(
  actor: ActorContext,
  programRunModuleIdRaw: string,
): Promise<PrepDocument[]> {
  const { programRunModuleId } = await authorizeRunModule(
    actor,
    programRunModuleIdRaw,
  );

  const result = await pool.query<PrepRow>(
    `select ${PREP_COLUMNS}, s.size_bytes
     from module_prep_documents d
     join storage_objects s on s.id = d.storage_object_id
     where d.program_run_module_id = $1 and d.withdrawn_at is null
     order by d.created_at asc`,
    [programRunModuleId],
  );

  return result.rows.map(mapPrepRow);
}

export async function uploadPrepDocument(
  actor: ActorContext,
  input: UploadPrepDocumentInput,
): Promise<PrepDocument> {
  const { programRunModuleId, workspaceId } = await authorizeRunModule(
    actor,
    input.programRunModuleId,
  );

  const existing = await pool.query<{ count: string }>(
    `select count(*)::text as count
     from module_prep_documents
     where program_run_module_id = $1 and withdrawn_at is null`,
    [programRunModuleId],
  );
  if (Number(existing.rows[0].count) >= MAX_PREP_DOCUMENTS_PER_MODULE) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      `This module already has ${MAX_PREP_DOCUMENTS_PER_MODULE} prep documents. ` +
        "Remove one before adding another.",
    );
  }

  // Bytes first: an upload that fails validation or storage must not
  // leave a prep row pointing at nothing.
  const stored = await uploadFile(actor, {
    workspaceId,
    filename: input.filename,
    contentType: input.contentType,
    content: input.content,
  });

  const result = await pool.query<PrepRow>(
    `insert into module_prep_documents (
       workspace_id, program_run_module_id, storage_object_id,
       original_filename, content_type, note, uploaded_by_user_id
     )
     values ($1, $2, $3, $4, $5, $6, $7)
     returning ${PREP_COLUMN_NAMES}`,
    [
      workspaceId,
      programRunModuleId,
      stored.id,
      stored.filename,
      stored.contentType,
      input.note?.trim() ?? "",
      actor.userId,
    ],
  );

  return mapPrepRow({
    ...result.rows[0],
    size_bytes: String(stored.sizeBytes),
  });
}

/**
 * Soft-withdraw: the document leaves the Work step but the row stays, so
 * an attempt that already read it keeps an accurate record of what was
 * visible at the time.
 */
export async function withdrawPrepDocument(
  actor: ActorContext,
  prepDocumentIdRaw: string,
): Promise<void> {
  assertRole(actor, ["founder"]);
  const prepDocumentId = parseEntityIdOrNotFound(
    prepDocumentIdRaw,
    "Document not found.",
  );
  const workspace = await resolveFounderWorkspace(actor);

  const result = await pool.query(
    `update module_prep_documents
     set withdrawn_at = now(), updated_at = now()
     where id = $1 and workspace_id = $2 and withdrawn_at is null`,
    [prepDocumentId, workspace.id],
  );

  if (result.rowCount === 0) {
    throw new ServiceError("NOT_FOUND", "Document not found.");
  }
}

/** Bytes for one prep document — used by download and by the MCP read tool. */
export async function readPrepDocument(
  actor: ActorContext,
  prepDocumentIdRaw: string,
): Promise<{ document: PrepDocument; content: Buffer }> {
  assertRole(actor, ["founder"]);
  const prepDocumentId = parseEntityIdOrNotFound(
    prepDocumentIdRaw,
    "Document not found.",
  );
  const workspace = await resolveFounderWorkspace(actor);

  const result = await pool.query<PrepRow>(
    `select ${PREP_COLUMNS}, s.size_bytes
     from module_prep_documents d
     join storage_objects s on s.id = d.storage_object_id
     where d.id = $1 and d.workspace_id = $2 and d.withdrawn_at is null`,
    [prepDocumentId, workspace.id],
  );
  const row = result.rows[0];
  if (!row) {
    throw new ServiceError("NOT_FOUND", "Document not found.");
  }

  const { content } = await readStorageObjectContent(
    actor,
    row.storage_object_id,
  );
  return { document: mapPrepRow(row), content };
}

export {
  MAX_PREP_DOCUMENTS_PER_MODULE,
  type PrepDocument,
  type UploadPrepDocumentInput,
};
