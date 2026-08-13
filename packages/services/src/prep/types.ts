/** Founder-uploaded prep material attached to one Module's Work step. */
export interface PrepDocument {
  id: string;
  programRunModuleId: string;
  storageObjectId: string;
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

// A Work step with more files than this is not prep any more, it is a
// document dump, and every one of them has to be read at open. The cap is
// per Module, not per run.
export const MAX_PREP_DOCUMENTS_PER_MODULE = 12;
