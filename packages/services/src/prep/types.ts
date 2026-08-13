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
  uploadedAt: Date;
}

export interface UploadPrepDocumentInput {
  programRunModuleId: string;
  filename: string;
  /** Untrusted browser-supplied MIME type. */
  contentType: string;
  content: Buffer;
  note?: string;
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
}

// A Work step with more files than this is not prep any more, it is a
// document dump, and every one of them has to be read at open. The cap is
// per Module, not per run.
export const MAX_PREP_DOCUMENTS_PER_MODULE = 12;
