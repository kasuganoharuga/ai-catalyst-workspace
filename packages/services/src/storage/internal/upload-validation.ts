import { ServiceError } from "@ai-catalyst/services/errors";

// Founder-supplied uploads, as opposed to the AI-generated Markdown that
// validation.ts governs. Two things differ and both matter:
//
//  1. The content type comes from the caller (a browser file picker), so
//     it is untrusted input and must be checked against an allowlist
//     rather than hardcoded the way GENERATED_TEXT_CONTENT_TYPE is.
//  2. The payload is arbitrary bytes, not UTF-8 text, so the size ceiling
//     is set for documents rather than for Markdown.

// 20 MiB. Interview notes exported to PDF and photographed whiteboards
// are the realistic upper end; anything larger is more likely a mistake
// than prep material, and the Founder gets a clear error rather than a
// silent truncation.
export const MAX_PREP_UPLOAD_BYTES = 20 * 1024 * 1024;

// Deliberately an allowlist of concrete types, not a prefix match on
// "application/" or "image/". The bytes are handed to a reading client
// verbatim, so widening this is a decision about what that client is
// expected to be able to open — not a formatting detail.
//
// Mapped to a canonical extension because browsers disagree on some of
// these (.md arrives as text/markdown, text/plain, or "" depending on OS
// and browser), and the stored filename should not depend on which.
const ALLOWED_UPLOAD_CONTENT_TYPES = new Map<string, string>([
  ["application/pdf", "pdf"],
  [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "docx",
  ],
  ["application/msword", "doc"],
  ["text/markdown", "md"],
  ["text/plain", "txt"],
  ["text/csv", "csv"],
  ["text/rtf", "rtf"],
  ["application/rtf", "rtf"],
]);

// Images are deliberately absent. Nothing on the server extracts text, so
// a screenshot of interview notes reaches the assistant as bytes it
// cannot read — get_prep_document returns readable:false for it. Accepting
// the upload would let a Founder believe they had handed over evidence
// that nothing can actually use. Document formats at least carry text a
// reading client can open.

/** Extensions accepted when the browser sends no usable content type. */
const EXTENSION_FALLBACK = new Map<string, string>([
  ["md", "text/markdown"],
  ["markdown", "text/markdown"],
  ["txt", "text/plain"],
  ["csv", "text/csv"],
]);

export function allowedPrepUploadContentTypes(): string[] {
  return [...ALLOWED_UPLOAD_CONTENT_TYPES.keys()];
}

/**
 * Resolves an untrusted browser-supplied content type to one this system
 * accepts. Falls back to the filename extension only for the plain-text
 * family, where an empty or generic type is a known browser behaviour
 * rather than a signal that the file is something else.
 */
export function resolvePrepUploadContentType(
  rawContentType: string,
  filename: string,
): string {
  // Strip any parameters ("text/plain; charset=utf-8") before matching.
  const base = rawContentType.split(";")[0]?.trim().toLowerCase() ?? "";

  if (ALLOWED_UPLOAD_CONTENT_TYPES.has(base)) {
    return base;
  }

  if (base === "" || base === "application/octet-stream") {
    const extension = filename.split(".").pop()?.toLowerCase() ?? "";
    const fallback = EXTENSION_FALLBACK.get(extension);
    if (fallback) {
      return fallback;
    }
  }

  throw new ServiceError(
    "VALIDATION_ERROR",
    `Files of type "${rawContentType || "unknown"}" cannot be uploaded as prep material. ` +
      `Accepted types: ${allowedPrepUploadContentTypes().join(", ")}.`,
  );
}

/** Validated against the real byte length, never a client-declared size. */
export function assertPrepUploadSizeWithinLimit(contentBuffer: Buffer): void {
  if (contentBuffer.byteLength === 0) {
    throw new ServiceError("VALIDATION_ERROR", "The uploaded file is empty.");
  }
  if (contentBuffer.byteLength > MAX_PREP_UPLOAD_BYTES) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      `The uploaded file is ${contentBuffer.byteLength} bytes, exceeding the ${MAX_PREP_UPLOAD_BYTES}-byte limit.`,
    );
  }
}
