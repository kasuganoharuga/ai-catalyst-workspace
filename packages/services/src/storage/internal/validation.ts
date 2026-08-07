import { ServiceError } from "@ai-catalyst/services/errors";

// 1 MiB — V1's generated Markdown text is far smaller than this in
// practice; raising the limit later is a one-line constant change, not a
// migration (the column itself, storage_objects.size_bytes, is a bigint
// with no schema-level cap).
export const MAX_GENERATED_TEXT_BYTES = 1 * 1024 * 1024;

// V1 hardcodes this server-side rather than accepting a caller-supplied
// contentType — see storage/index.ts's createPendingGeneratedObject for
// the full reasoning. Once a second generated content type exists, this
// becomes a Service-side allowlist keyed off some other trusted input,
// still never a raw caller-supplied MIME string.
export const GENERATED_TEXT_CONTENT_TYPE = "text/markdown; charset=utf-8";

// Validated against the actual encoded byte length of the content
// (Buffer.from(content, "utf8").byteLength at the call site), not the
// string's .length (character count) — a multi-byte UTF-8 string can be
// well under MAX_GENERATED_TEXT_BYTES characters but over the limit in
// bytes, or vice versa is impossible, but the reverse mistake (trusting
// .length) is not.
export function assertGeneratedTextSizeWithinLimit(
  contentBuffer: Buffer,
): void {
  if (contentBuffer.byteLength > MAX_GENERATED_TEXT_BYTES) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      `Generated text content is ${contentBuffer.byteLength} bytes, exceeding the ${MAX_GENERATED_TEXT_BYTES}-byte limit.`,
    );
  }
}
