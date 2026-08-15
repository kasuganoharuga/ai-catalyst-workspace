/**
 * What a prep document actually is. "interview_transcript" is the only kind
 * that counts toward a Module's confirmed-interview floor (see
 * MINIMUM_CONFIRMED_INTERVIEWS) — every other kind of prep material
 * (a pitch deck, research notes, anything else) is "other" and never
 * counted, so the floor cannot be satisfied by unrelated documents.
 */
export type PrepDocumentKind = "interview_transcript" | "other";

/**
 * Founder-uploaded prep material attached to one Module's Work step, OR
 * the AI assistant's own faithful transcription of a file the Founder
 * shared directly in chat for a Module with no website Documents step.
 * Exactly one of storageObjectId / extractedText is set, matching the
 * module_prep_documents_source_xor check constraint.
 */
export interface PrepDocument {
  id: string;
  programRunModuleId: string;
  storageObjectId: string | null;
  /** Set only on the assistant-extracted path; null for an uploaded file. */
  extractedText: string | null;
  filename: string;
  contentType: string;
  sizeBytes: number | null;
  note: string;
  documentKind: PrepDocumentKind;
  /**
   * Number of distinct interviews this document represents — set only when
   * documentKind is "interview_transcript" (null otherwise, matching the
   * module_prep_documents check constraint). A Founder may share several
   * interviews in one document; the caller is expected to have separated
   * them and counted the true number, not assumed one document = one
   * interview.
   */
  interviewCount: number | null;
  uploadedAt: Date;
}

export interface UploadPrepDocumentInput {
  programRunModuleId: string;
  filename: string;
  /** Untrusted browser-supplied MIME type. */
  contentType: string;
  content: Buffer;
  note?: string;
  /** Defaults to "other" when omitted. */
  documentKind?: PrepDocumentKind;
  /** Required when documentKind is "interview_transcript"; must be omitted otherwise. */
  interviewCount?: number;
}

export interface SavePrepExtractInput {
  programRunModuleId: string;
  /** Founder-facing label for what was shared, e.g. "pitch-deck.pdf". */
  filename: string;
  /**
   * The assistant's own faithful transcription of the original text —
   * not a condensed summary, and never the raw file bytes. There is no
   * uploaded file backing this record, so this is the only copy.
   */
  extractedText: string;
  note?: string;
  /**
   * Required. "interview_transcript" for customer interviews; "other" for
   * everything else. Unlike website uploads, this is never defaulted —
   * omitting it used to silently store "other" and fail Module 4's gate.
   */
  documentKind: PrepDocumentKind;
  /**
   * Required when documentKind is "interview_transcript": the number of
   * distinct interviews transcribed in extractedText, not the number of
   * files the Founder shared. If the Founder pasted several interviews
   * into one message, the caller must separate them and report the true
   * count here.
   */
  interviewCount?: number;
}

// A Work step with more files than this is not prep any more, it is a
// document dump, and every one of them has to be read at open. The cap is
// per Module, not per run.
export const MAX_PREP_DOCUMENTS_PER_MODULE = 12;

// Module 4 may not start Solution work (Block 1 onward) until this many
// confirmed interview transcripts have been saved. Reintroduced narrowly
// after 0018 retired the old database-enforced floor — see
// 0021_module_prep_document_interview_kind.sql for why this is different
// from what was removed. No maximum is enforced yet.
export const MINIMUM_CONFIRMED_INTERVIEWS = 5;
