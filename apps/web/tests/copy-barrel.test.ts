import { describe, expect, it } from "vitest";

import * as copyBarrel from "@/app/(app)/lib/copy";

// The 73+ files that `import { x } from "…/lib/copy"` resolve here via
// Node/Next's directory-import rule and rely on the barrel re-exporting
// exactly what the single copy.ts file used to. copy.test.ts exercises the
// values it imports; this asserts the full export *surface* — the one
// thing that a dropped or renamed export during the copy/ split would
// break silently in every other file's build instead of here.
const EXPECTED_EXPORTS = [
  "ManualStep",
  "STEP_ILLUSTRATION_KEYS",
  "StepIllustrationKey",
  "connectionCopy",
  "AssistantCopy",
  "assistantCopy",
  "handoffCopy",
  "dashboardCopy",
  "onboardingCopy",
  "assistantSectionCopy",
  "module0Copy",
  "moduleRunCopy",
  "ModuleBeforeItem",
  "ModuleCoachingCard",
  "ModuleBriefCopy",
  "MODULE_BRIEF_COPY",
  "resolveModuleCopy",
  "module1Copy",
  "moduleCompletedTitle",
  "moduleCompletedBody",
  "moduleConfirmCta",
  "retryCopy",
  "moduleGateCopy",
  "modulesCopy",
  "artefactsCopy",
  "workspaceCopy",
  "ventureStatusLabel",
  "lifecycleStageLabel",
  "errorCopy",
  "toastCopy",
  "profilePromptCopy",
  "mentorDashboardCopy",
  "founderPreviewCopy",
  "mentorOverviewCopy",
  "mentorFounderDetailCopy",
  "mentorArtefactDocumentCopy",
  "mentorInvitationsCopy",
].sort();

describe("copy barrel", () => {
  it("re-exports exactly the names copy.ts used to, no more and no less", () => {
    // Type-only exports (interfaces/types) leave no runtime trace, so they
    // can't appear in Object.keys(copyBarrel) — this only catches value
    // exports, which is every non-interface/type name in the list above.
    const runtimeExpected = EXPECTED_EXPORTS.filter(
      (name) =>
        ![
          "ManualStep",
          "StepIllustrationKey",
          "AssistantCopy",
          "ModuleBeforeItem",
          "ModuleCoachingCard",
          "ModuleBriefCopy",
        ].includes(name),
    );
    expect(Object.keys(copyBarrel).sort()).toEqual(runtimeExpected);
  });
});
