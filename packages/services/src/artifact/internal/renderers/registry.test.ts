import { describe, expect, it } from "vitest";

import { problemInterviewWorkbookV1 } from "./problem-interview-workbook-v1.js";
import { registerWorkbookRenderer, resolveWorkbookRenderer } from "./registry.js";
import { validationRoadmapWorkbookV1 } from "./validation-roadmap-workbook-v1.js";

describe("resolveWorkbookRenderer", () => {
  it("resolves both real renderer keys", () => {
    expect(resolveWorkbookRenderer("problem_interview_workbook_v1").rendererKey).toBe(
      "problem_interview_workbook_v1",
    );
    expect(resolveWorkbookRenderer("validation_roadmap_workbook_v1").rendererKey).toBe(
      "validation_roadmap_workbook_v1",
    );
  });

  it("throws INTERNAL_INVARIANT_ERROR for an unregistered key", () => {
    expect(() => resolveWorkbookRenderer("not_a_real_renderer_key")).toThrow(
      /No WorkbookRenderer is registered/,
    );
  });

  it("an override takes precedence over the real registration, without touching it", () => {
    const fake = registerWorkbookRenderer(problemInterviewWorkbookV1);
    const resolved = resolveWorkbookRenderer("problem_interview_workbook_v1", {
      problem_interview_workbook_v1: fake,
    });
    expect(resolved).toBe(fake);
    expect(resolveWorkbookRenderer("problem_interview_workbook_v1")).not.toBe(fake);
  });

  it("snapshots rendererVersion for both renderers — a bump here must be deliberate", () => {
    expect(problemInterviewWorkbookV1.rendererVersion).toBe("1");
    expect(validationRoadmapWorkbookV1.rendererVersion).toBe("1");
  });
});
