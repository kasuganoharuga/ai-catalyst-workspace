import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { resolveCurrentModule } from "../moduleAccess.js";
import { getProjectState } from "../storage/repository.js";
import { toolError, toolResult } from "./toolResult.js";

export const getCurrentModuleInputShape = {
  project_id: z.string().min(1),
};

const getCurrentModuleInputSchema = z.object(getCurrentModuleInputShape);

export type GetCurrentModuleInput = z.infer<typeof getCurrentModuleInputSchema>;

function messageForStatus(status: string): string | undefined {
  switch (status) {
    case "ready_to_unlock":
      return "The latest submission passed validation. Return to the AI Catalyst website to confirm completion and unlock the next module.";
    case "needs_revision":
      return "The latest submission needs revision. Call get_latest_validation_feedback for details, then upload a corrected version on the website.";
    default:
      return undefined;
  }
}

export async function getCurrentModule(input: GetCurrentModuleInput): Promise<CallToolResult> {
  const state = await getProjectState();
  if (!state || state.project_id !== input.project_id) {
    return toolError("UNKNOWN_PROJECT", `Project ${input.project_id} was not found.`);
  }

  const current = resolveCurrentModule(state);
  if (!current) {
    return toolError(
      "NO_ACTIVE_MODULE",
      `No active module for project ${input.project_id}. Nothing is in_progress, needs_revision, or ready_to_unlock.`,
    );
  }

  const message = messageForStatus(current.status);
  return toolResult({
    project_id: input.project_id,
    module_id: current.module_id,
    status: current.status,
    ...(message ? { message } : {}),
  });
}
