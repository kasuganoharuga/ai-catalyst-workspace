import { createHash } from "node:crypto";

// Listed under "./storage/internal/hash" in package.json so Turbopack can
// resolve this module's cross-directory imports (storage/index.ts and
// storage/providers/local.ts both import this by value) — see
// packages/services/src/internal/branch.ts for the underlying reason.
//
// Always computed from the actual Buffer that was hashed/written — never
// from a caller-declared length or a string's character count, which is
// exactly the mistake this module exists to prevent (UTF-8 characters can
// be multiple bytes).
export function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
