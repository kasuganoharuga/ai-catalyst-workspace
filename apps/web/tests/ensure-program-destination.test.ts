import { describe, expect, it } from "vitest";

import { SHOW_SETUP_MODULE } from "@/lib/feature-flags";
import {
  hasPendingSetupModule,
  type NextModuleCandidate,
  resolveNextModuleDestination,
} from "@/lib/ensure-program-destination";

function setup(status: NextModuleCandidate["status"]): NextModuleCandidate {
  return {
    moduleKey: "module-00-setup",
    status,
    moduleType: "setup",
  };
}

function pressureTest(
  status: NextModuleCandidate["status"],
): NextModuleCandidate {
  return {
    moduleKey: "module-01-pressure-test",
    status,
    moduleType: "standard",
  };
}

function financialModel(
  status: NextModuleCandidate["status"],
): NextModuleCandidate {
  return {
    moduleKey: "module-02-financial-model",
    status,
    moduleType: "standard",
  };
}

describe("resolveNextModuleDestination", () => {
  it("prefers in_progress over later available modules", () => {
    expect(
      resolveNextModuleDestination([
        pressureTest("in_progress"),
        financialModel("available"),
      ]),
    ).toBe("/modules/module-01-pressure-test");
  });

  it("returns the first available module when none are in progress", () => {
    expect(
      resolveNextModuleDestination([
        pressureTest("available"),
        financialModel("locked"),
      ]),
    ).toBe("/modules/module-01-pressure-test");
  });

  it("returns dashboard when every module is completed", () => {
    expect(
      resolveNextModuleDestination([
        setup("completed"),
        pressureTest("completed"),
      ]),
    ).toBe("/dashboard");
  });

  // The Module 0 hide, from the resolver's side: even a setup module that
  // is genuinely actionable must not be handed to a Founder, because
  // nothing in the UI links to it any more. autoCompleteSetupModule
  // normally completes it first; these cover the case where that failed.
  describe("while the setup module is hidden", () => {
    it("only runs when SHOW_SETUP_MODULE is off", () => {
      expect(SHOW_SETUP_MODULE).toBe(false);
    });

    it("skips an available setup module in favour of the next real one", () => {
      expect(
        resolveNextModuleDestination([
          setup("available"),
          pressureTest("available"),
        ]),
      ).toBe("/modules/module-01-pressure-test");
    });

    it("skips an in_progress setup module rather than stranding the Founder", () => {
      expect(
        resolveNextModuleDestination([
          setup("in_progress"),
          pressureTest("available"),
        ]),
      ).toBe("/modules/module-01-pressure-test");
    });

    it("falls through to the dashboard when only the setup module is open", () => {
      expect(
        resolveNextModuleDestination([
          setup("available"),
          pressureTest("locked"),
        ]),
      ).toBe("/dashboard");
    });
  });
});

// This is what stops a Run created before the setup module was hidden from
// becoming a dead end. Without it the dashboard links straight to a locked
// Module 1, which tells the founder to "finish the previous module" —
// a module that no longer has an entry point anywhere in the UI.
describe("hasPendingSetupModule", () => {
  it("is true while a setup module is open and blocking", () => {
    expect(
      hasPendingSetupModule([setup("in_progress"), pressureTest("locked")]),
    ).toBe(true);
  });

  it("is true for a setup module that is merely available", () => {
    expect(
      hasPendingSetupModule([setup("available"), pressureTest("locked")]),
    ).toBe(true);
  });

  it("is false once the setup module is completed", () => {
    expect(
      hasPendingSetupModule([setup("completed"), pressureTest("available")]),
    ).toBe(false);
  });

  it("is false for a run that has no setup module at all", () => {
    expect(hasPendingSetupModule([pressureTest("available")])).toBe(false);
  });

  it("ignores non-setup modules that are still locked", () => {
    expect(
      hasPendingSetupModule([
        setup("completed"),
        pressureTest("in_progress"),
        financialModel("locked"),
      ]),
    ).toBe(false);
  });
});
