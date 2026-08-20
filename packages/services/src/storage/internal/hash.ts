import { createHash } from "node:crypto";

// package.json export: Turbopack resolution for storage cross-directory imports (see internal/branch.ts).
// sha256 always from the actual Buffer written — never caller-declared length or string char count.
export function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
