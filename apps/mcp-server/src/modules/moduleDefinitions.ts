import { getManifestModuleBySlugOrId } from "./manifest.js";

export type ModuleDefinition = {
  id: string;
  slug: string;
  objective: string;
  description: string;
  requiredArtifactFilename: string;
  requiredSections: string[];
  verdictDecisionKeywords: string[];
  outputRules: string[];
};

/**
 * Unlike the old stdio POC (where module-02-hmw intentionally had no
 * definition), this revision needs a real - if minimal - entry for it: the
 * whole point of the test script is proving get_module_context refuses to
 * serve Module 2's requirements before the website unlocks it (MODULE_LOCKED),
 * then succeeds immediately after. Nothing here drives Module 2 to
 * completion; no upload/validate flow is exercised for it in this POC.
 */
const MODULE_DEFINITIONS: Record<string, ModuleDefinition> = {
  "module-01-pressure-test": {
    id: "module-01-pressure-test",
    slug: "pressure-test",
    objective: "Help founders critically assess whether an idea is worth pursuing before over-investing in it.",
    description:
      "Pressure-test the idea against real evidence and produce a clear Proceed/Pivot/Kill verdict with concrete next actions.",
    requiredArtifactFilename: "Pressure-Test Verdict.md",
    requiredSections: ["Problem", "Target Customer", "Evidence", "Key Assumptions", "Verdict", "Next Actions"],
    verdictDecisionKeywords: ["Proceed", "Pivot", "Kill"],
    outputRules: [
      "Verdict must include an explicit Proceed, Pivot, or Kill decision.",
      "Next Actions must contain at least one bullet point.",
    ],
  },
  "module-02-hmw": {
    id: "module-02-hmw",
    slug: "hmw",
    objective: "Turn the validated problem into focused How Might We questions.",
    description:
      "Reframe the pressure-tested problem as a small set of How Might We questions that point toward solution exploration.",
    requiredArtifactFilename: "HMW Statements.md",
    requiredSections: ["Validated Problem", "Target User", "How Might We Statements", "Selected HMW", "Rationale"],
    verdictDecisionKeywords: [],
    outputRules: ["Selected HMW must be one of the statements listed in How Might We Statements."],
  },
};

/** Resolves either a full module id ("module-01-pressure-test") or a bare manifest slug ("pressure-test") to the canonical module id. */
export async function normalizeModuleId(moduleIdOrSlug: string): Promise<string | undefined> {
  if (MODULE_DEFINITIONS[moduleIdOrSlug]) {
    return moduleIdOrSlug;
  }
  const manifestModule = await getManifestModuleBySlugOrId(moduleIdOrSlug);
  return manifestModule?.id;
}

export function getModuleDefinition(moduleId: string): ModuleDefinition | undefined {
  return MODULE_DEFINITIONS[moduleId];
}

export function hasModuleDefinition(moduleId: string): boolean {
  return moduleId in MODULE_DEFINITIONS;
}
