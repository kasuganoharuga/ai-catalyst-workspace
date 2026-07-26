import { describe, expect, it } from "vitest";

import {
  dashboardCopy,
  lifecycleStageLabel,
  module1CompletedBody,
  module1CompletedTitle,
  module1ConfirmCta,
  ventureStatusLabel,
  type FounderDecision,
} from "@/app/(app)/lib/copy";

const DECISIONS: FounderDecision[] = ["proceed", "pivot", "kill"];

describe("module 1 completion copy", () => {
  it("gives every decision its own title and call to action", () => {
    const titles = DECISIONS.map(module1CompletedTitle);
    const ctas = DECISIONS.map(module1ConfirmCta);

    expect(new Set(titles).size).toBe(DECISIONS.length);
    expect(new Set(ctas).size).toBe(DECISIONS.length);
  });

  // Kill and pivot complete the module just as proceed does. Copy that
  // reads as a failure would make the founder who picked the harder,
  // more honest answer feel they got it wrong.
  it("names the next module when there is one, for every decision", () => {
    for (const decision of DECISIONS) {
      const body = module1CompletedBody(decision, "Module 2 · HMW");
      expect(body, decision).toContain("Module 2 · HMW");
    }
  });

  it("does not dangle a reference to a next module when there isn't one", () => {
    for (const decision of DECISIONS) {
      const body = module1CompletedBody(decision, null);
      expect(body, decision).not.toContain("undefined");
      expect(body, decision).not.toContain("null");
      expect(body.trim().endsWith("."), decision).toBe(true);
    }
  });
});

// These exist because the raw column values were being rendered straight
// to the screen — a founder could be shown "company_formed", underscore
// and all.
describe("venture labels", () => {
  it("labels every lifecycle stage without underscores", () => {
    const stages = ["idea", "validating", "validated", "company_formed"];
    for (const stage of stages) {
      expect(lifecycleStageLabel(stage), stage).not.toContain("_");
    }
    expect(lifecycleStageLabel("company_formed")).toBe("Company formed");
  });

  it("labels every venture status", () => {
    for (const status of ["active", "paused", "abandoned", "archived"]) {
      expect(ventureStatusLabel(status), status).toMatch(/^[A-Z]/);
    }
  });

  // Better a raw value on screen than a blank where a state should be.
  it("passes an unknown value through rather than blanking it", () => {
    expect(ventureStatusLabel("some_future_status")).toBe("some_future_status");
    expect(lifecycleStageLabel("some_future_stage")).toBe("some_future_stage");
  });
});

describe("dashboard greeting", () => {
  it("only says 'back' to someone who has been here before", () => {
    expect(dashboardCopy.greetingFirstVisit("Ada")).not.toContain("back");
    expect(dashboardCopy.greetingReturning("Ada")).toContain("back");
  });

  it("uses the founder's name in both", () => {
    expect(dashboardCopy.greetingFirstVisit("Ada")).toContain("Ada");
    expect(dashboardCopy.greetingReturning("Ada")).toContain("Ada");
  });
});
