import { describe, expect, it } from "vitest";

import { resolveWorkbookRenderer } from "../../artifact/internal/renderers/registry.js";
import { DEFAULT_TOOLKIT_CONTENT } from "./index.js";
import type { ArtifactContent } from "../types.js";

// Modelled on config-template-contract.test.ts's own two-directions
// pattern. Every `##`/`###` heading in an artifact's template, in document
// order — the `###` matters here (validation_roadmap_workbook_v1's
// "Expected evidence signal strength" scoring anchors are a subheading; a
// level-2-only scan would have let it be renamed without anything
// noticing).
const HEADING_PATTERN = /^(#{2,3})\s+(.+?)\s*$/gm;

function headingsIn(template: string): string[] {
  return [...template.matchAll(HEADING_PATTERN)].map((match) => match[2]);
}

function workbookArtifacts(): Array<{
  moduleKey: string;
  artifact: ArtifactContent;
}> {
  const result: Array<{ moduleKey: string; artifact: ArtifactContent }> = [];
  for (const module of DEFAULT_TOOLKIT_CONTENT.modules) {
    for (const artifact of module.artifacts) {
      if (artifact.rendererKey !== null) {
        result.push({ moduleKey: module.moduleKey, artifact });
      }
    }
  }
  return result;
}

describe("workbook renderer requiredSections-to-template contract", () => {
  const artifacts = workbookArtifacts();

  it("finds at least one workbook-rendered artifact to check", () => {
    expect(artifacts.length).toBeGreaterThan(0);
  });

  for (const { moduleKey, artifact } of artifacts) {
    it(`${moduleKey} / ${artifact.artifactKey}: requiredSections and the template's headings agree exactly`, () => {
      const renderer = resolveWorkbookRenderer(artifact.rendererKey as string);
      const template = (artifact.outputConfig as { templateMarkdown: string })
        .templateMarkdown;
      const templateHeadings = headingsIn(template);

      // Forward: catches a renderer referencing a heading the template no
      // longer has (renamed or removed).
      for (const required of renderer.requiredSections) {
        expect(
          templateHeadings,
          `renderer "${artifact.rendererKey}" declares requiredSections "${required}", which is not a heading in ${artifact.artifactKey}'s template`,
        ).toContain(required);
      }

      // Reverse — the direction that actually matters (plan §12): catches
      // a heading added to the template that the renderer's content
      // contract never learned about, so it silently never gets rendered.
      for (const heading of templateHeadings) {
        expect(
          renderer.requiredSections,
          `${artifact.artifactKey}'s template has heading "${heading}", which renderer "${artifact.rendererKey}" does not declare in requiredSections`,
        ).toContain(heading);
      }
    });
  }
});
