import { describe, expect, it } from "vitest";

import { expectedFieldNames, resolveSectionCount } from "./manifest-fields.js";
import { PROBLEM_INTERVIEW_FIELD_MANIFEST_V1 } from "./manifests/interview-v1.js";
import { VALIDATION_ROADMAP_FIELD_MANIFEST_V1 } from "./manifests/roadmap-v1.js";
import type { FieldManifest } from "./types.js";

describe("resolveSectionCount", () => {
  it("returns a fixed count unchanged", () => {
    const manifest: FieldManifest = { sectionPrefix: "x", sectionCount: { kind: "fixed", value: 3 }, fields: [] };
    expect(resolveSectionCount(manifest, 999)).toBe(3);
  });

  it("accepts a requested count within an option manifest's range", () => {
    expect(resolveSectionCount(PROBLEM_INTERVIEW_FIELD_MANIFEST_V1, 5)).toBe(5);
    expect(resolveSectionCount(PROBLEM_INTERVIEW_FIELD_MANIFEST_V1, 10)).toBe(10);
  });

  it.each([4, 11, 7.5])("rejects an out-of-range or non-integer request (%s)", (requested) => {
    expect(() => resolveSectionCount(PROBLEM_INTERVIEW_FIELD_MANIFEST_V1, requested)).toThrow(
      /WORKBOOK_RENDER_FAILED/,
    );
  });

  it("accepts a requested count within a fromModel manifest's range", () => {
    expect(resolveSectionCount(VALIDATION_ROADMAP_FIELD_MANIFEST_V1, 2)).toBe(2);
    expect(resolveSectionCount(VALIDATION_ROADMAP_FIELD_MANIFEST_V1, 3)).toBe(3);
  });

  it("rejects a fromModel count outside its declared range", () => {
    expect(() => resolveSectionCount(VALIDATION_ROADMAP_FIELD_MANIFEST_V1, 4)).toThrow(/WORKBOOK_RENDER_FAILED/);
  });
});

describe("expectedFieldNames — problem_interview_workbook_v1", () => {
  const context = {
    sectionCount: 5,
    familyCount: (source: string) => (source === "passBarConditions" ? 3 : 0),
  };

  it("produces exactly 120 fields for a 5-section, 3-condition round (matches the verified 12-page sample)", () => {
    expect(expectedFieldNames(PROBLEM_INTERVIEW_FIELD_MANIFEST_V1, context)).toHaveLength(120);
  });

  it("produces exactly 240 fields for a 10-section round", () => {
    expect(expectedFieldNames(PROBLEM_INTERVIEW_FIELD_MANIFEST_V1, { ...context, sectionCount: 10 })).toHaveLength(
      240,
    );
  });

  it("uses middle-index naming for the question family (question_1_notes, not question_notes_1)", () => {
    const names = expectedFieldNames(PROBLEM_INTERVIEW_FIELD_MANIFEST_V1, context);
    expect(names).toContain("interview_1.question_1_notes");
    expect(names).toContain("interview_1.question_5_notes");
    expect(names).not.toContain("interview_1.question_notes_1");
  });

  it("does not emit a 4th pass-bar checkbox when the model has only 3 conditions", () => {
    const names = expectedFieldNames(PROBLEM_INTERVIEW_FIELD_MANIFEST_V1, context);
    expect(names).toContain("interview_1.pass_bar_3");
    expect(names).not.toContain("interview_1.pass_bar_4");
  });

  it("emits a 4th pass-bar checkbox when the model has 4 conditions", () => {
    const fourConditionContext = { sectionCount: 5, familyCount: () => 4 };
    const names = expectedFieldNames(PROBLEM_INTERVIEW_FIELD_MANIFEST_V1, fourConditionContext);
    expect(names).toContain("interview_1.pass_bar_4");
  });

  it("always emits exactly 3 kill-criterion checkboxes", () => {
    const names = expectedFieldNames(PROBLEM_INTERVIEW_FIELD_MANIFEST_V1, context);
    const killFields = names.filter((n) => n.includes("kill_criterion") && n.startsWith("interview_1."));
    expect(killFields).toHaveLength(3);
  });

  it("names every section interview_1..interview_N regardless of round/additional status", () => {
    const names = expectedFieldNames(PROBLEM_INTERVIEW_FIELD_MANIFEST_V1, { ...context, sectionCount: 6 });
    expect(names.some((n) => n.startsWith("interview_6."))).toBe(true);
    expect(names.some((n) => n.startsWith("interview_7."))).toBe(false);
  });

  it("produces no duplicate field names", () => {
    const names = expectedFieldNames(PROBLEM_INTERVIEW_FIELD_MANIFEST_V1, { ...context, sectionCount: 10 });
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("expectedFieldNames — validation_roadmap_workbook_v1", () => {
  it("produces the right field count for 2 experiments and never a blank 3rd page", () => {
    const names = expectedFieldNames(VALIDATION_ROADMAP_FIELD_MANIFEST_V1, {
      sectionCount: 2,
      familyCount: () => 0,
    });
    expect(names.some((n) => n.startsWith("experiment_1."))).toBe(true);
    expect(names.some((n) => n.startsWith("experiment_2."))).toBe(true);
    expect(names.some((n) => n.startsWith("experiment_3."))).toBe(false);
  });

  it("produces a 3rd experiment's fields when the model has 3 experiments", () => {
    const names = expectedFieldNames(VALIDATION_ROADMAP_FIELD_MANIFEST_V1, {
      sectionCount: 3,
      familyCount: () => 0,
    });
    expect(names).toContain("experiment_3.outcome");
    expect(names).toContain("experiment_3.decision");
  });

  it("includes both dropdown fields per experiment", () => {
    const names = expectedFieldNames(VALIDATION_ROADMAP_FIELD_MANIFEST_V1, {
      sectionCount: 2,
      familyCount: () => 0,
    });
    expect(names).toContain("experiment_1.outcome");
    expect(names).toContain("experiment_1.decision");
  });
});

function allFieldSpecs(manifest: FieldManifest) {
  return manifest.fields;
}

describe("manifest capacity discipline (plan §6, §12)", () => {
  it.each([
    ["problem_interview_workbook_v1", PROBLEM_INTERVIEW_FIELD_MANIFEST_V1],
    ["validation_roadmap_workbook_v1", VALIDATION_ROADMAP_FIELD_MANIFEST_V1],
  ])("%s has no undefined or placeholder capacity on any text field", (_name, manifest) => {
    for (const field of allFieldSpecs(manifest)) {
      if (field.type !== "text") continue;
      expect(field.capacity, `field with suffix "${"suffix" in field ? field.suffix : field.suffixTemplate}"`).not.toBe(
        undefined,
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(field.capacity as any).not.toBe("spike");
      expect(field.capacity!).toBeGreaterThan(0);
    }
  });

  it.each([
    ["problem_interview_workbook_v1", PROBLEM_INTERVIEW_FIELD_MANIFEST_V1],
    ["validation_roadmap_workbook_v1", VALIDATION_ROADMAP_FIELD_MANIFEST_V1],
  ])("%s has options on every dropdown field", (_name, manifest) => {
    for (const field of allFieldSpecs(manifest)) {
      if (field.type !== "dropdown") continue;
      expect(field.options?.length ?? 0).toBeGreaterThan(0);
    }
  });
});
