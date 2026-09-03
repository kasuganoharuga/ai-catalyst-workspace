/** Same slug shape used for both the rendered heading id and a comment anchor's `href="#…"`. */
export function slugifyArtifactHeading(text: string): string {
  const slug = text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug.length > 0 ? slug : "section";
}
