import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { resolveCurrentModule, resolveRequestedModule } from "../moduleAccess.js";
import { normalizeModuleId } from "../modules/moduleDefinitions.js";
import { findLatestSubmission, getProjectState } from "../storage/repository.js";
import { toolError, toolResult } from "./toolResult.js";

export const getLatestValidationFeedbackInputShape = {
  project_id: z.string().min(1),
  module_id: z.string().min(1).optional(),
};

const getLatestValidationFeedbackInputSchema = z.object(getLatestValidationFeedbackInputShape);

export type GetLatestValidationFeedbackInput = z.infer<typeof getLatestValidationFeedbackInputSchema>;

export async function getLatestValidationFeedback(
  input: GetLatestValidationFeedbackInput,
): Promise<CallToolResult> {
  const state = await getProjectState();
  if (!state || state.project_id !== input.project_id) {
    return toolError("UNKNOWN_PROJECT", `Project ${input.project_id} was not found.`);
  }

  let moduleId: string;
  if (input.module_id) {
    const normalized = await normalizeModuleId(input.module_id);
    if (!normalized) {
      return toolError("UNKNOWN_MODULE", `Module ${input.module_id} was not found in the toolkit manifest.`);
    }
    const access = resolveRequestedModule(state, normalized);
    if (!access.ok) {
      return toolError(access.error.error_code, access.error.message);
    }
    moduleId = normalized;
  } else {
    const current = resolveCurrentModule(state);
    if (!current) {
      return toolError(
        "NO_ACTIVE_MODULE",
        `No active module for project ${input.project_id}. Nothing is in_progress, needs_revision, or ready_to_unlock.`,
      );
    }
    moduleId = current.module_id;
  }

  const submission = await findLatestSubmission(input.project_id, moduleId);
  if (!submission) {
    return toolResult({
      project_id: input.project_id,
      module_id: moduleId,
      submission_version: null,
      validation_status: null,
      issues: [],
      message: "No submission has been uploaded yet for this module.",
    });
  }

  return toolResult({
    project_id: input.project_id,
    module_id: moduleId,
    submission_version: submission.version,
    validation_status: submission.validation_status,
    issues: submission.issues,
  });
}
