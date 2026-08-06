import manifestJson from "@ai-catalyst/toolkit-content/manifest.json" with { type: "json" };
import type { ToolkitManifest } from "@ai-catalyst/shared";

import type { ModuleContent } from "../types.js";

const toolkitManifest = manifestJson as ToolkitManifest;

// These placeholders carry only the labels manifest.json already has, and
// stay a draft that is never activated under this Program Version. Real
// content for these modules must be published under a *new* Program
// Version once each has its own workflow spec — this is an immutable
// draft placeholder snapshot, not a draft that gets finished in place.
const PLACEHOLDER_MANIFEST_IDS = new Set(["module-05-solution-options", "module-06-validation-plan"]);

function describePlaceholder(founderInputs: string[], outputs: string[]): string {
  return `Founder inputs: ${founderInputs.join(", ")}. Outputs: ${outputs.join(", ")}.`;
}

export function buildPlaceholderModules(): ModuleContent[] {
  return toolkitManifest.modules
    .filter((module) => PLACEHOLDER_MANIFEST_IDS.has(module.id))
    .map((module): ModuleContent => {
      const sequenceIndex = Number.parseInt(module.number, 10);
      if (!Number.isInteger(sequenceIndex) || sequenceIndex <= 0) {
        throw new Error(
          `Placeholder module "${module.id}" has a non-numeric manifest "number" (${module.number}); cannot derive sequence_index.`,
        );
      }

      return {
        moduleKey: module.id,
        sequenceIndex,
        title: module.title,
        subtitle: null,
        description: describePlaceholder(module.founderInputs, module.outputs),
        objective: module.objective,
        moduleType: "standard",
        isRequired: true,
        allowRevisions: true,
        completionMode: "artifact_and_confirmation",
        estimatedMinutes: null,
        isPublishable: false,
        questions: [],
        artifacts: [],
      };
    });
}
