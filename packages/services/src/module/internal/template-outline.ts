import type { ModuleCatalogArtifactOutlineSection } from "@ai-catalyst/shared";

/**
 * Turns an Artifact Definition's template Markdown into a compact outline
 * the Founder UI can render as a section check-list. Only ## headings are
 * kept — nested ### / bullet fields are too detailed for a glanceable
 * Expected output panel.
 */
export function parseTemplateOutline(
  markdown: string | null | undefined,
): ModuleCatalogArtifactOutlineSection[] {
  if (!markdown) return [];

  const sections: ModuleCatalogArtifactOutlineSection[] = [];

  for (const rawLine of markdown.split(/\r?\n/)) {
    const h2 = /^##\s+(.+)$/.exec(rawLine.trim());
    if (h2) {
      sections.push({ heading: h2[1].trim(), items: [] });
    }
  }

  return sections;
}
