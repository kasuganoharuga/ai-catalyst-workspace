// Shared slug-string handling for every entity that derives a URL-safe
// slug from a user-facing display name — Workspace (packages/services/src/
// invitation, PR 1.2) and Venture (packages/services/src/venture, PR 1.3).
// Kept in one place so the two never quietly diverge on what counts as
// "safe" or what happens when a name has no ASCII-slug-able characters at
// all (Chinese, emoji, pure punctuation).
//
// Listed under "./internal/slug" in package.json purely so Turbopack (used
// by apps/web's `next build`) can resolve the NodeNext-mandated `.js`
// extension on this module's own cross-file imports the same way
// "@ai-catalyst/services/errors" already does — a plain relative import
// (`../internal/slug.js`) fails to resolve under Turbopack even though
// `tsc` accepts it. This is not part of the intended public API: apps/web
// and apps/mcp must not import it directly, only files inside
// packages/services should.
const SLUG_MAX_LENGTH = 40;

export function slugifyBase(name: string, fallback: string): string {
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, "");

  return sanitized.length > 0 ? sanitized : fallback;
}
