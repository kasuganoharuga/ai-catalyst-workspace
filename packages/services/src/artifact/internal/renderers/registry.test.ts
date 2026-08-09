import { describe, expect, it } from "vitest";

import { idealCustomerAvatarWorkbookV1 } from "./ideal-customer-avatar-workbook-v1.js";
import { problemInterviewWorkbookV1 } from "./problem-interview-workbook-v1.js";
import {
  registerWorkbookRenderer,
  resolveWorkbookRenderer,
} from "./registry.js";
import { validationRoadmapWorkbookV1 } from "./validation-roadmap-workbook-v1.js";

describe("resolveWorkbookRenderer", () => {
  it("resolves legacy pdf-lib and HTML→Gotenberg renderer keys", () => {
    expect(
      resolveWorkbookRenderer("problem_interview_workbook_v1").rendererKey,
    ).toBe("problem_interview_workbook_v1");
    expect(
      resolveWorkbookRenderer("validation_roadmap_workbook_v1").rendererKey,
    ).toBe("validation_roadmap_workbook_v1");
    expect(
      resolveWorkbookRenderer("ideal_customer_avatar_export_v1").rendererKey,
    ).toBe("ideal_customer_avatar_export_v1");
    expect(
      resolveWorkbookRenderer("ideal_customer_avatar_html_v1").rendererKey,
    ).toBe("ideal_customer_avatar_html_v1");
    expect(resolveWorkbookRenderer("interview_guide_html_v1").rendererKey).toBe(
      "interview_guide_html_v1",
    );
    expect(
      resolveWorkbookRenderer("problem_statement_html_v1").rendererKey,
    ).toBe("problem_statement_html_v1");
    expect(
      resolveWorkbookRenderer("evidence_of_unmet_need_html_v1").rendererKey,
    ).toBe("evidence_of_unmet_need_html_v1");
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
    expect(resolveWorkbookRenderer("problem_interview_workbook_v1")).not.toBe(
      fake,
    );
  });

  it("snapshots rendererVersion for all three renderers — a bump here must be deliberate", () => {
    expect(problemInterviewWorkbookV1.rendererVersion).toBe("1");
    expect(validationRoadmapWorkbookV1.rendererVersion).toBe("1");
    expect(idealCustomerAvatarWorkbookV1.rendererVersion).toBe("1");
  });
});
