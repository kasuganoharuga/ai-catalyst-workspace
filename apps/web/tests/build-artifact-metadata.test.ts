import { describe, expect, it } from "vitest";

import type { ModuleContextArtifactSummary } from "@ai-catalyst/shared";

import { buildArtifactMetadata } from "@/app/(app)/modules/[moduleKey]/lib/load-module-detail";
import type { ExpectedArtifact } from "@/app/(app)/modules/[moduleKey]/types";

function catalogArtifact(
  artifactKey: string,
  overrides: Partial<ExpectedArtifact> = {},
): ExpectedArtifact {
  return {
    artifactKey,
    name: `${artifactKey} name`,
    requiredFilename: `${artifactKey}.md`,
    isRequired: true,
    outline: [{ heading: "Venture", items: [] }],
    workbookSupported: false,
    workbookFormat: null,
    ...overrides,
  };
}

function contextArtifact(
  artifactKey: string,
  latestSubmission: ModuleContextArtifactSummary["latestSubmission"] = null,
  isRequired = true,
): ModuleContextArtifactSummary {
  return {
    artifactKey,
    name: `${artifactKey} real name`,
    isRequired,
    requiredFilename: `${artifactKey}.md`,
    templateMarkdown: null,
    latestSubmission,
    workbookSupported: false,
    workbookAvailable: false,
    workbookFormat: null,
  };
}

describe("buildArtifactMetadata", () => {
  it("uses the catalog alone, all unsaved, when no Run exists yet (contextArtifacts null)", () => {
    const result = buildArtifactMetadata(null, [
      catalogArtifact("problem_statement"),
      catalogArtifact("problem_interview_guide"),
    ]);

    expect(result).toEqual([
      {
        artifactKey: "problem_statement",
        name: "problem_statement name",
        requiredFilename: "problem_statement.md",
        isRequired: true,
        outline: [{ heading: "Venture", items: [] }],
        versionNumber: null,
        savedAt: null,
        workbookSupported: false,
        workbookAvailable: false,
        workbookFormat: null,
      },
      {
        artifactKey: "problem_interview_guide",
        name: "problem_interview_guide name",
        requiredFilename: "problem_interview_guide.md",
        isRequired: true,
        outline: [{ heading: "Venture", items: [] }],
        versionNumber: null,
        savedAt: null,
        workbookSupported: false,
        workbookAvailable: false,
        workbookFormat: null,
      },
    ]);
  });

  it("in the pre-Run preview, workbookAvailable is always false even when the catalog says workbookSupported", () => {
    const result = buildArtifactMetadata(null, [
      catalogArtifact("problem_interview_guide", {
        workbookSupported: true,
        workbookFormat: "pdf",
      }),
    ]);
    expect(result[0]).toMatchObject({
      workbookSupported: true,
      workbookAvailable: false,
      workbookFormat: "pdf",
    });
  });

  it("once a Run exists, workbookAvailable comes straight from the context Artifact, not the catalog", () => {
    const result = buildArtifactMetadata(
      [
        {
          ...contextArtifact("problem_interview_guide", {
            versionNumber: 3,
            status: "submitted",
            submittedAt: "2026-08-06T03:00:00.000Z",
            updatedAt: "2026-08-06T03:00:00.000Z",
          }),
          workbookSupported: true,
          workbookAvailable: true,
          workbookFormat: "pdf",
        },
      ],
      [
        catalogArtifact("problem_interview_guide", {
          workbookSupported: true,
          workbookFormat: "pdf",
        }),
      ],
    );
    expect(result[0]).toMatchObject({
      workbookSupported: true,
      workbookAvailable: true,
      workbookFormat: "pdf",
    });
  });

  it("preserves contextArtifacts' order and real data when a Run exists, merging in the catalog outline", () => {
    const result = buildArtifactMetadata(
      [
        contextArtifact("problem_statement", {
          versionNumber: 2,
          status: "submitted",
          submittedAt: "2026-08-06T03:00:00.000Z",
          updatedAt: "2026-08-06T03:00:00.000Z",
        }),
        contextArtifact("problem_interview_guide"),
      ],
      [
        catalogArtifact("problem_statement", {
          outline: [{ heading: "Root Cause", items: [] }],
        }),
        catalogArtifact("problem_interview_guide", {
          outline: [{ heading: "Pass Bar", items: [] }],
        }),
      ],
    );

    expect(result[0]).toEqual({
      artifactKey: "problem_statement",
      name: "problem_statement real name",
      requiredFilename: "problem_statement.md",
      isRequired: true,
      outline: [{ heading: "Root Cause", items: [] }],
      versionNumber: 2,
      savedAt: "2026-08-06T03:00:00.000Z",
      workbookSupported: false,
      workbookAvailable: false,
      workbookFormat: null,
    });
    expect(result[1]).toEqual({
      artifactKey: "problem_interview_guide",
      name: "problem_interview_guide real name",
      requiredFilename: "problem_interview_guide.md",
      isRequired: true,
      outline: [{ heading: "Pass Bar", items: [] }],
      versionNumber: null,
      savedAt: null,
      workbookSupported: false,
      workbookAvailable: false,
      workbookFormat: null,
    });
  });

  it("carries isRequired through from both the catalog and the run context", () => {
    const fromCatalog = buildArtifactMetadata(null, [
      catalogArtifact("supporting_notes", { isRequired: false }),
    ]);
    expect(fromCatalog[0].isRequired).toBe(false);

    const fromContext = buildArtifactMetadata(
      [contextArtifact("supporting_notes", null, false)],
      [catalogArtifact("supporting_notes", { isRequired: false })],
    );
    expect(fromContext[0].isRequired).toBe(false);
  });

  it("returns a single-entry array unchanged in shape for a one-Artifact Module (Module 1's own case)", () => {
    const result = buildArtifactMetadata(
      [contextArtifact("pressure_test_verdict")],
      [catalogArtifact("pressure_test_verdict")],
    );
    expect(result).toHaveLength(1);
    expect(result[0].artifactKey).toBe("pressure_test_verdict");
  });

  it("falls back to an empty outline when the catalog has no matching artifactKey", () => {
    const result = buildArtifactMetadata(
      [contextArtifact("mystery_artifact")],
      [catalogArtifact("problem_statement")],
    );
    expect(result[0].outline).toEqual([]);
  });

  it("uses submittedAt, not updatedAt, for savedAt", () => {
    const result = buildArtifactMetadata(
      [
        contextArtifact("evidence_of_unmet_need", {
          versionNumber: 1,
          status: "draft",
          submittedAt: null,
          updatedAt: "2026-08-06T03:00:00.000Z",
        }),
      ],
      [catalogArtifact("evidence_of_unmet_need")],
    );
    expect(result[0].versionNumber).toBe(1);
    expect(result[0].savedAt).toBeNull();
  });
});
