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
  MINIMUM_CONFIRMED_INTERVIEWS,
  type PrepDocument,
  type PrepDocumentKind,
  type SavePrepExtractInput,
  type UploadPrepDocumentInput,
} from "@ai-catalyst/services/prep/types";

// Founder-uploaded prep material for a Module's Work step (step 2), or —
// for a Module with no website Documents step — the assistant's own
// faithful transcription of a file the Founder shared directly in chat.
//
// This service owns the join between a program_run_module and the stored
// bytes; storage/ owns the bytes themselves. For an uploaded file, nothing
// here extracts or summarises content: the reading client parses the
// file, so the record stays a pointer rather than a second, staler copy
// of what the file says. `savePrepExtract` is the one deliberate
// exception — for Modules with no upload path at all, the assistant's
// transcription is the only copy there is, so it is instructed to
// transcribe faithfully rather than condense.

// Explicit column list — never `select *` — so internal columns
// (workspace_id, withdrawn_at, uploaded_by_user_id) never leak into the
// DTO. Two spellings because the reads join storage_objects and need the
// alias, while the insert's `returning` has no alias to qualify.
const PREP_COLUMN_NAMES = `
  id, program_run_module_id, storage_object_id, extracted_text,
  original_filename, content_type, note, document_kind, interview_count,
  created_at
`;
const PREP_COLUMNS = PREP_COLUMN_NAMES.trim()
  .split(/,\s*/)
  .map((column) => `d.${column}`)
  .join(", ");

interface PrepRow {
  id: string;
  program_run_module_id: string;
  storage_object_id: string | null;
  extracted_text: string | null;
  original_filename: string;
  content_type: string;
  note: string;
  document_kind: PrepDocumentKind;
  interview_count: number | null;
  created_at: Date;
  size_bytes: string | null;
}

function mapPrepRow(row: PrepRow): PrepDocument {
  return {
    id: row.id,
    programRunModuleId: row.program_run_module_id,
    storageObjectId: row.storage_object_id,
    extractedText: row.extracted_text,
    filename: row.original_filename,
    contentType: row.content_type,
    // bigint arrives as a string from `pg`; parsed at the DTO boundary.
    sizeBytes: row.size_bytes === null ? null : Number(row.size_bytes),
    note: row.note,
    documentKind: row.document_kind,
    interviewCount: row.interview_count,
    uploadedAt: row.created_at,
  };
}

/**
 * Validates a caller-supplied documentKind/interviewCount pair against the
 * module_prep_documents_source_xor-style rule enforced by the check
 * constraint added in 0021: interviewCount is required (and must be a
 * positive integer) when the kind is "interview_transcript", and must be
 * omitted for every other kind. Returns the normalised pair to insert.
 */
function resolveDocumentKindAndCount(
  documentKind: PrepDocumentKind | undefined,
  interviewCount: number | undefined,
): { documentKind: PrepDocumentKind; interviewCount: number | null } {
  const kind = documentKind ?? "other";
  if (kind === "interview_transcript") {
    if (
      typeof interviewCount !== "number" ||
      !Number.isInteger(interviewCount) ||
      interviewCount < 1
    ) {
      throw new ServiceError(
        "VALIDATION_ERROR",
        'interviewCount must be a positive integer when documentKind is "interview_transcript" — ' +
          "the number of distinct interviews this document actually contains, not the number of files shared.",
      );
    }
    return { documentKind: kind, interviewCount };
  }
  if (interviewCount !== undefined) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      'interviewCount may only be set when documentKind is "interview_transcript".',
    );
  }
  return { documentKind: kind, interviewCount: null };
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
     left join storage_objects s on s.id = d.storage_object_id
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

  const { documentKind, interviewCount } = resolveDocumentKindAndCount(
    input.documentKind,
    input.interviewCount,
  );

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
       original_filename, content_type, note, document_kind,
       interview_count, uploaded_by_user_id
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning ${PREP_COLUMN_NAMES}`,
    [
      workspaceId,
      programRunModuleId,
      stored.id,
      stored.filename,
      stored.contentType,
      input.note?.trim() ?? "",
      documentKind,
      interviewCount,
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

/**
 * Content for one prep document — used by download and by the MCP read
 * tool. An uploaded file's bytes come from Storage; an assistant-saved
 * transcription has no storage object at all, so its own text is the
 * content.
 */
export async function readPrepDocument(
  actor: ActorContext,
  prepDocumentIdRaw: string,
): Promise<{ document: PrepDocument; content: Buffer | null }> {
  assertRole(actor, ["founder"]);
  const prepDocumentId = parseEntityIdOrNotFound(
    prepDocumentIdRaw,
    "Document not found.",
  );
  const workspace = await resolveFounderWorkspace(actor);

  const result = await pool.query<PrepRow>(
    `select ${PREP_COLUMNS}, s.size_bytes
     from module_prep_documents d
     left join storage_objects s on s.id = d.storage_object_id
     where d.id = $1 and d.workspace_id = $2 and d.withdrawn_at is null`,
    [prepDocumentId, workspace.id],
  );
  const row = result.rows[0];
  if (!row) {
    throw new ServiceError("NOT_FOUND", "Document not found.");
  }

  const document = mapPrepRow(row);
  if (document.storageObjectId === null) {
    return { document, content: null };
  }

  const { content } = await readStorageObjectContent(
    actor,
    document.storageObjectId,
  );
  return { document, content };
}

/**
 * Persists the assistant's own faithful transcription of a file the
 * Founder shared directly in chat, for a Module with no website
 * Documents step. Shares the same per-Module cap and authorization as an
 * uploaded file, but writes no storage_objects row — extractedText is
 * the only copy, so callers (the facilitator prompt) are expected to
 * have the Founder confirm it before calling this, the same as any other
 * save.
 */
export async function savePrepExtract(
  actor: ActorContext,
  input: SavePrepExtractInput,
): Promise<PrepDocument> {
  const { programRunModuleId, workspaceId } = await authorizeRunModule(
    actor,
    input.programRunModuleId,
  );

  const extractedText = input.extractedText.trim();
  if (extractedText.length === 0) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "extractedText must not be empty.",
    );
  }

  const { documentKind, interviewCount } = resolveDocumentKindAndCount(
    input.documentKind,
    input.interviewCount,
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

  const result = await pool.query<PrepRow>(
    `insert into module_prep_documents (
       workspace_id, program_run_module_id, extracted_text,
       original_filename, content_type, note, document_kind,
       interview_count, uploaded_by_user_id
     )
     values ($1, $2, $3, $4, 'text/plain', $5, $6, $7, $8)
     returning ${PREP_COLUMN_NAMES}`,
    [
      workspaceId,
      programRunModuleId,
      extractedText,
      input.filename,
      input.note?.trim() ?? "",
      documentKind,
      interviewCount,
      actor.userId,
    ],
  );

  return mapPrepRow({ ...result.rows[0], size_bytes: null });
}

/**
 * Sum of interviewCount across every live, confirmed interview-transcript
 * document for one Module — the number Module 4's floor is measured
 * against. "Confirmed" here means the row exists at all: a save is only
 * ever called after the facilitator has shown the Founder the
 * transcription and gotten their confirmation (see savePrepExtract's own
 * docstring), the same trust boundary as every other save in this codebase.
 */
export async function getConfirmedInterviewCount(
  actor: ActorContext,
  programRunModuleIdRaw: string,
): Promise<number> {
  const { programRunModuleId } = await authorizeRunModule(
    actor,
    programRunModuleIdRaw,
  );
  return countConfirmedInterviews(programRunModuleId);
}

/**
 * Same sum as {@link getConfirmedInterviewCount}, callable from inside an
 * already-open transaction/actor-authorized context (e.g. saveFounderResponse's
 * gate check) that has no reason to re-authorize the run module.
 */
export async function countConfirmedInterviews(
  programRunModuleId: string,
): Promise<number> {
  const result = await pool.query<{ total: string }>(
    `select coalesce(sum(interview_count), 0)::text as total
     from module_prep_documents
     where program_run_module_id = $1
       and withdrawn_at is null
       and document_kind = 'interview_transcript'`,
    [programRunModuleId],
  );
  return Number(result.rows[0]?.total ?? "0");
}

export {
  MAX_PREP_DOCUMENTS_PER_MODULE,
  MINIMUM_CONFIRMED_INTERVIEWS,
  type PrepDocument,
  type PrepDocumentKind,
  type SavePrepExtractInput,
  type UploadPrepDocumentInput,
};
