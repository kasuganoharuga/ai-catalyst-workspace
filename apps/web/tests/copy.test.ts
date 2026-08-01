import { describe, expect, it } from "vitest";

import {
  artefactsCopy,
  dashboardCopy,
  errorCopy,
  lifecycleStageLabel,
  module0Copy,
  module1Copy,
  module1CompletedBody,
  module1CompletedTitle,
  module1ConfirmCta,
  moduleGateCopy,
  modulesCopy,
  profilePromptCopy,
  retryCopy,
  ventureStatusLabel,
  workspaceCopy,
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

// A founder picks one assistant and every screen outside the connection
// page and the hand-off is supposed to stop naming vendors entirely. There
// are no component tests in this app, so this is the only thing standing
// between that rule and the next person who writes "ask Claude to…" into a
// shared string.
describe("neutral copy", () => {
  const VENDOR = /Claude|ChatGPT|OpenAI|Anthropic/i;

  const NEUTRAL_COPY: Record<string, object> = {
    dashboardCopy,
    moduleGateCopy,
    module0Copy,
    module1Copy,
    modulesCopy,
    artefactsCopy,
    workspaceCopy,
    retryCopy,
    errorCopy,
    profilePromptCopy,
  };

  // Walks nested objects and arrays, because manualStep-shaped entries and
  // the `before` list hold their strings a level or two down.
  function* strings(value: unknown): Generator<string> {
    if (typeof value === "string") {
      yield value;
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) yield* strings(item);
      return;
    }
    if (value && typeof value === "object") {
      for (const item of Object.values(value)) yield* strings(item);
    }
  }

  for (const [name, copy] of Object.entries(NEUTRAL_COPY)) {
    it(`${name} names no vendor`, () => {
      for (const value of strings(copy)) {
        expect(value, `${name}: ${value}`).not.toMatch(VENDOR);
      }
    });
  }

  // Functions are skipped by the walk above, so the two that interpolate an
  // assistant's name are checked directly: they must carry it in, not
  // hard-code it.
  it("module 0 takes the assistant name as an argument", () => {
    expect(module0Copy.checkTitle("ChatGPT")).toContain("ChatGPT");
    expect(module0Copy.checkBody("ChatGPT")).toContain("ChatGPT");
    expect(module0Copy.checkTitle("ChatGPT")).not.toMatch(/Claude/);
    expect(module0Copy.checkBody("ChatGPT")).not.toMatch(/Claude/);
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
