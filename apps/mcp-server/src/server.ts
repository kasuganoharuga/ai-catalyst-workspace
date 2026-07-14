import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { logger } from "./logger.js";
import { assertManifestShapeForPoc } from "./modules/manifest.js";
import { checkDraft, checkDraftInputShape, type CheckDraftInput } from "./tools/checkDraft.js";
import {
  getCurrentModule,
  getCurrentModuleInputShape,
  type GetCurrentModuleInput,
} from "./tools/getCurrentModule.js";
import {
  getLatestValidationFeedback,
  getLatestValidationFeedbackInputShape,
  type GetLatestValidationFeedbackInput,
} from "./tools/getLatestValidationFeedback.js";
import { getModuleContext, getModuleContextInputShape, type GetModuleContextInput } from "./tools/getModuleContext.js";
import { toolError } from "./tools/toolResult.js";

/** Wraps a handler so an unexpected thrown error (e.g. disk I/O failure) still comes back as a proper CallToolResult with isError: true, never a bare thrown exception. */
function safeHandler<Input>(
  toolName: string,
  handler: (input: Input) => Promise<CallToolResult>,
): (input: Input) => Promise<CallToolResult> {
  return async (input: Input) => {
    try {
      return await handler(input);
    } catch (error) {
      logger.error(`Unhandled error in tool ${toolName}`, { error: String(error) });
      return toolError("INTERNAL_ERROR", `Unexpected error while running ${toolName}: ${String(error)}`);
    }
  };
}

/**
 * Every tool registered here is read-only / advisory - none of them can
 * mutate project-state.json or submissions.json. Upload, validation, and
 * unlock are exclusively website routes (src/web/routes.ts), never MCP
 * tools. This is the actual boundary this POC is testing: Claude/ChatGPT can
 * see everything the server knows, but cannot change any of it.
 */
export async function createServer(): Promise<McpServer> {
  await assertManifestShapeForPoc();

  const server = new McpServer({
    name: "ai-catalyst-mcp-server-poc",
    version: "0.2.0",
  });

  server.registerTool(
    "get_current_module",
    {
      title: "Get current module",
      description:
        "Reads which AI Catalyst module the founder is currently working on for a project, and its status. " +
        "Resolves priority in_progress -> needs_revision -> ready_to_unlock; never returns a locked module. " +
        "Call this first, before get_module_context, to find out what module_id to ask about.",
      inputSchema: getCurrentModuleInputShape,
    },
    safeHandler<GetCurrentModuleInput>("get_current_module", getCurrentModule),
  );

  server.registerTool(
    "get_module_context",
    {
      title: "Get module context",
      description:
        "Reads a specific module's requirements (objective, description, required filename, required sections, " +
        "output rules) and status. module_id is required - use get_current_module first if you don't already know " +
        "it. Refuses with MODULE_LOCKED if the module has not been unlocked by the website yet, even if you already " +
        "know its id.",
      inputSchema: getModuleContextInputShape,
    },
    safeHandler<GetModuleContextInput>("get_module_context", getModuleContext),
  );

  server.registerTool(
    "get_latest_validation_feedback",
    {
      title: "Get latest validation feedback",
      description:
        "Reads the most recent website submission's validation result (passed/failed + issue list) for a module. " +
        "module_id is optional - defaults to the current module. Use this to help the founder fix a rejected " +
        "submission before they re-upload on the website.",
      inputSchema: getLatestValidationFeedbackInputShape,
    },
    safeHandler<GetLatestValidationFeedbackInput>(
      "get_latest_validation_feedback",
      getLatestValidationFeedback,
    ),
  );

  server.registerTool(
    "check_draft",
    {
      title: "Check draft",
      description:
        "Pre-checks draft Markdown content against a module's required sections without saving or submitting " +
        "anything. Always returns draft_check_only: true and can_unlock_module: false - this can never substitute " +
        "for a real website upload. Use this to sanity-check a draft before telling the founder to upload it.",
      inputSchema: checkDraftInputShape,
    },
    safeHandler<CheckDraftInput>("check_draft", checkDraft),
  );

  return server;
}
