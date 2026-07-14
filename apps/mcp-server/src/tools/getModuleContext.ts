import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { resolveRequestedModule } from "../moduleAccess.js";
import { getModuleDefinition, normalizeModuleId } from "../modules/moduleDefinitions.js";
import { getProjectState } from "../storage/repository.js";
import { toolError, toolResult } from "./toolResult.js";

export const getModuleContextInputShape = {
  project_id: z.string().min(1),
  module_id: z.string().min(1),
};

const getModuleContextInputSchema = z.object(getModuleContextInputShape);

export type GetModuleContextInput = z.infer<typeof getModuleContextInputSchema>;

/**
 * module_id is required here - finding "the current module" is
 * get_current_module's job only. This tool's only job is: given a specific
 * module_id, is it unlocked, and if so what does it require. Refuses
 * MODULE_LOCKED even if the caller guesses a locked module's id, so Claude
 * can never preview a future module's requirements before the website
 * unlocks it.
 */
export async function getModuleContext(input: GetModuleContextInput): Promise<CallToolResult> {
  const state = await getProjectState();
  if (!state || state.project_id !== input.project_id) {
    return toolError("UNKNOWN_PROJECT", `Project ${input.project_id} was not found.`);
  }

  const moduleId = await normalizeModuleId(input.module_id);
  if (!moduleId) {
    return toolError("UNKNOWN_MODULE", `Module ${input.module_id} was not found in the toolkit manifest.`);
  }

  const access = resolveRequestedModule(state, moduleId);
  if (!access.ok) {
    return toolError(access.error.error_code, access.error.message);
  }

  const definition = getModuleDefinition(moduleId);
  if (!definition) {
    return toolError(
      "MODULE_DEFINITION_NOT_AVAILABLE",
      `No test definition exists for module ${moduleId} in this POC.`,
    );
  }

  return toolResult({
    project_id: input.project_id,
    module_id: moduleId,
    module_slug: definition.slug,
    status: access.module.status,
    objective: definition.objective,
    description: definition.description,
    required_filename: definition.requiredArtifactFilename,
    required_sections: definition.requiredSections,
    output_rules: definition.outputRules,
  });
}
