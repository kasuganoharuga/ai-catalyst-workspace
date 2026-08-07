import { describe, expect, it } from "vitest";

import type {
  ModuleCatalogEntry,
  ModuleContext,
  RunModuleSummary,
} from "@ai-catalyst/shared";

import { buildDashboardViewModel } from "@/app/(app)/dashboard/lib/dashboard-state";

function catalogEntry(
  moduleKey: string,
  sequenceIndex: number,
  overrides: Partial<ModuleCatalogEntry> = {},
): ModuleCatalogEntry {
  return {
    moduleKey,
    sequenceIndex,
    title: `Title for ${moduleKey}`,
    subtitle: `Subtitle for ${moduleKey}`,
    description: null,
    objective: null,
    moduleType: "standard",
    completionMode: "artifact_and_confirmation",
    estimatedMinutes: null,
    catalogStatus: "live",
    expectedArtifacts: [],
    ...overrides,
  };
}

function runModule(
  moduleKey: string,
  sequenceIndex: number,
  status: RunModuleSummary["status"],
  overrides: Partial<RunModuleSummary> = {},
): RunModuleSummary {
  return {
    id: `${moduleKey}-run`,
    workspaceId: "workspace-1",
    programRunId: "run-1",
    programRunBranchId: "branch-1",
    moduleDefinitionId: `${moduleKey}-def`,
    moduleKey,
    title: `Title for ${moduleKey}`,
    sequenceIndex,
    moduleType: "standard",
    completionMode: "artifact_and_confirmation",
    status,
    activeAttemptId: null,
    acceptedAttemptId: null,
    unlockedAt: null,
    startedAt: null,
    completedAt: null,
    ...overrides,
  } as RunModuleSummary;
}

function context(
  moduleKey: string,
  runModuleStatus: RunModuleSummary["status"],
  savedArtifactKeys: string[] = [],
): ModuleContext {
  return {
    runModule: runModule(moduleKey, 0, runModuleStatus),
    activeAttempt: null,
    displayAttempt: null,
    resumeQuestionKey: null,
    questions: [],
    artifacts: savedArtifactKeys.map((artifactKey) => ({
      artifactKey,
      name: artifactKey,
      isRequired: true,
      requiredFilename: `${artifactKey}.md`,
      latestSubmission: {
        versionNumber: 1,
        status: "submitted" as const,
        submittedAt: "2026-08-06T00:00:00.000Z",
        updatedAt: "2026-08-06T00:00:00.000Z",
      },
      workbookSupported: false,
      workbookAvailable: false,
      workbookFormat: null,
    })),
    prompts: [],
  };
}

const BASE_INPUT = {
  connection: { authorised: true, lastActivityAt: null } as never,
  profile: { firstName: "Ada", lastName: "Lovelace" },
  sessionUserName: "Ada Lovelace",
  profilePromptSkipped: true,
  passwordChanged: true,
  showSetupModule: false,
};

describe("buildDashboardViewModel — current-module resolution", () => {
  it("points the next action at the first unlocked-but-not-done Module, not just Module 1", () => {
    const catalog = [
      catalogEntry("module-00-setup", 0, { moduleType: "setup" }),
      catalogEntry("module-01-pressure-test", 1),
      catalogEntry("module-02-customer-avatar", 2),
    ];
    const runModules = [
      runModule("module-00-setup", 0, "completed", { moduleType: "setup" }),
      runModule("module-01-pressure-test", 1, "completed"),
      runModule("module-02-customer-avatar", 2, "in_progress"),
    ];
    const contexts = [
      context("module-00-setup", "completed", ["setup_summary"]),
      context("module-01-pressure-test", "completed", [
        "pressure_test_verdict",
      ]),
      context("module-02-customer-avatar", "in_progress"),
    ];

    const view = buildDashboardViewModel({
      ...BASE_INPUT,
      catalog,
      runModules,
      hasRun: true,
      contexts,
    });

    expect(view.nextAction).toMatchObject({
      href: "/modules/module-02-customer-avatar",
      title: "Start Title for module-02-customer-avatar",
      body: "Subtitle for module-02-customer-avatar",
    });
    expect(view.welcomeSub).toBe(
      "Title for module-02-customer-avatar is open. Work through it with your AI assistant.",
    );
  });

  it("sums saved artefacts across every Module's Context, not just Module 0/1", () => {
    const catalog = [
      catalogEntry("module-00-setup", 0, { moduleType: "setup" }),
      catalogEntry("module-01-pressure-test", 1),
      catalogEntry("module-03-problem-statement", 3),
    ];
    const runModules = [
      runModule("module-00-setup", 0, "completed", { moduleType: "setup" }),
      runModule("module-01-pressure-test", 1, "completed"),
      runModule("module-03-problem-statement", 3, "completed"),
    ];
    const contexts = [
      context("module-00-setup", "completed", ["setup_summary"]),
      context("module-01-pressure-test", "completed", [
        "pressure_test_verdict",
      ]),
      // Two Artefacts, matching Module 3's real shape.
      context("module-03-problem-statement", "completed", [
        "problem_statement",
        "problem_interview_guide",
      ]),
    ];

    const view = buildDashboardViewModel({
      ...BASE_INPUT,
      catalog,
      runModules,
      hasRun: true,
      contexts,
    });

    expect(view.artefactsSaved).toBe(4);
  });

  it("falls back to the generic done state once every unlockable Module is complete, without claiming the whole program is over", () => {
    const catalog = [catalogEntry("module-04-evidence-of-unmet-need", 4)];
    const runModules = [
      runModule("module-04-evidence-of-unmet-need", 4, "completed"),
    ];
    const contexts = [context("module-04-evidence-of-unmet-need", "completed")];

    const view = buildDashboardViewModel({
      ...BASE_INPUT,
      catalog,
      runModules,
      hasRun: true,
      contexts,
    });

    expect(view.nextAction).toMatchObject({ href: "/artefacts" });
    expect(view.welcomeSub).not.toMatch(/module 1/i);
    expect(view.welcomeSub).toBe(
      "Everything open right now is done. More opens as it's ready.",
    );
  });
});
