import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { resolveRequestedModule } from "../moduleAccess.js";
import { getModuleDefinition, normalizeModuleId } from "../modules/moduleDefinitions.js";
import { getProjectState } from "../storage/repository.js";
import { validateArtefactContent } from "../validation/artefactValidator.js";
import { toolError, toolResult } from "./toolResult.js";

export const checkDraftInputShape = {
  project_id: z.string().min(1),
  module_id: z.string().min(1),
  content: z.string().min(1),
};

const checkDraftInputSchema = z.object(checkDraftInputShape);

export type CheckDraftInput = z.infer<typeof checkDraftInputSchema>;

/**
 * Runs the same validator the website's /api/upload route uses, against
 * inline draft content, with zero persistence. Always echoes
 * draft_check_only: true and can_unlock_module: false so the result can
 * never be mistaken for - or later cited as - a real submission.
 */
export async function checkDraft(input: CheckDraftInput): Promise<CallToolResult> {
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

  const { missing } = validateArtefactContent(input.content, definition);

  return toolResult({
    draft_check_only: true,
    can_unlock_module: false,
    project_id: input.project_id,
    module_id: moduleId,
    missing,
  });
}
