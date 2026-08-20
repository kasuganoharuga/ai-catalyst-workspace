// Shared slug rules for workspace/venture — one place so they never diverge.
// package.json export for Turbopack NodeNext .js resolution — apps must not import directly.
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
