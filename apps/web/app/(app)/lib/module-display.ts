// Presentation-only: maps run/attempt states to labels and colours (logic stays in services).

// Content-stable module keys from content-seed — V1 status UI knows these by name.
export const MODULE_1_KEY = "module-01-pressure-test";
export const MODULE_2_KEY = "module-02-customer-avatar";
export const MODULE_3_KEY = "module-03-problem-statement";
export const MODULE_4_KEY = "module-04-solution-statement";
export const MODULE_5_KEY = "module-05-epics-user-stories";
export const MODULE_6_KEY = "module-06-competitive-analysis";
export const MODULE_7_KEY = "module-07-business-model";

/** Headline output artifact for catalog/dashboard — first required, not `artifacts[0]` (Module 4's inbound interview evidence sorts first but is not produced here). */
export function headlineArtifact<T extends { isRequired: boolean }>(
  artifacts: readonly T[],
): T | null {
  return (
    artifacts.find((artifact) => artifact.isRequired) ?? artifacts[0] ?? null
  );
}

/**
 * Artifacts produced before the Claude / confirm path, so they stay off the
 * work-step and confirm-step "documents this module produces" lists.
 *
 * Empty since interview material became Founder-uploaded prep documents:
 * Module 4's Interview Evidence was the only inbound artefact, and prep
 * documents are not artefacts at all. Kept as a map because a future
 * module may again take something in that it does not produce.
 */
const PREREQUISITE_ARTIFACT_KEY: Record<string, string> = {};

/**
 * Null for a Module with no off-platform prerequisite. Callers use it to
 * keep the prerequisite Artifact out of the "documents this Module
 * produces" list — it has its own row, and it is an inbound record rather
 * than an output.
 */
export function prerequisiteArtifactKey(moduleKey: string): string | null {
  return PREREQUISITE_ARTIFACT_KEY[moduleKey] ?? null;
}

/** False for a Module with no prerequisite — the row is copy-gated, not shown at all. */
export function isWorkPrerequisiteMet(
  moduleKey: string,
  artifacts: { artifactKey: string; versionNumber: number | null }[],
): boolean {
  const artifactKey = prerequisiteArtifactKey(moduleKey);
  if (!artifactKey) {
    return false;
  }
  return artifacts.some(
    (artifact) =>
      artifact.artifactKey === artifactKey && artifact.versionNumber !== null,
  );
}

/**
 * Required Claude/output artifacts for Confirm — excludes inbound
 * prerequisites. None exist today (see PREREQUISITE_ARTIFACT_KEY), but the
 * exclusion stays so a future inbound artefact does not silently gate sign-off.
 */
export function requiredOutputArtifactsSaved(
  moduleKey: string,
  artifacts: {
    artifactKey: string;
    isRequired: boolean;
    versionNumber: number | null;
  }[],
): boolean {
  const prerequisiteKey = prerequisiteArtifactKey(moduleKey);
  const required = artifacts.filter(
    (artifact) =>
      artifact.isRequired && artifact.artifactKey !== prerequisiteKey,
  );
  if (required.length === 0) return false;
  return required.every((artifact) => artifact.versionNumber !== null);
}

// How many --module-accent-N vars globals.css defines; indices wrap past seven modules.
const MODULE_ACCENT_COUNT = 7;

/** Inline style for a module number badge — dynamic index, not a static Tailwind class. */
export function moduleAccentStyle(sequenceIndex: number): {
  backgroundColor: string;
} {
  const index =
    ((sequenceIndex % MODULE_ACCENT_COUNT) + MODULE_ACCENT_COUNT) %
    MODULE_ACCENT_COUNT;
  return { backgroundColor: `var(--module-accent-${index})` };
}
