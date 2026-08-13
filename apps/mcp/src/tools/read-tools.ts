import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { getActiveContext } from "@ai-catalyst/services/workspace/active-context";
import {
  getRunModuleByKey,
  listRunModules,
  resolveAttemptRunContext,
} from "@ai-catalyst/services/workflow";
import { getModuleContext } from "@ai-catalyst/services/module/context";
import { getArtifactSubmission } from "@ai-catalyst/services/artifact";
import { readPrepDocument } from "@ai-catalyst/services/prep";

import { jsonToolResponse, withMcpAudit } from "./audit-wrapper.js";

// Read-only MCP tools: validate input and delegate to packages/services.

const MODULE_KEY_SHAPE = { moduleKey: z.string().min(1) };
const ARTIFACT_KEY_SHAPE = {
  attemptId: z.string().min(1),
  artifactKey: z.string().min(1),
};
const PREP_DOCUMENT_SHAPE = { prepDocumentId: z.string().min(1) };

// Text-ish uploads are returned inline as UTF-8. Anything else (PDF,
// Word, images) is returned as metadata plus an explicit
// `readable: false`, because this server does not extract text and
// guessing at a binary's contents would be worse than saying so.
const INLINE_TEXT_CONTENT_TYPES = new Set([
  "text/markdown",
  "text/plain",
  "text/csv",
  "text/rtf",
  "application/rtf",
]);

export function registerReadTools(mcp: McpServer, actor: ActorContext): void {
  mcp.registerTool(
    "get_active_context",
    {
      title: "Get active context",
      description:
        "Resolves the Founder's current Workspace/Venture selection. Navigation context only — never a basis for authorization.",
    },
    async () => {
      const response = await withMcpAudit(
        { toolName: "get_active_context", actor },
        async () => {
          const context = await getActiveContext(actor);
          return {
            response: jsonToolResponse(context),
            audit: { workspaceId: context.workspaceId },
          };
        },
      );
      return response;
    },
  );

  mcp.registerTool(
    "list_modules",
    {
      title: "List modules",
      description:
        "Lists every Module in the Founder's current Program Run/Branch, with each Module's canonical Run-scoped status.",
    },
    async () => {
      const response = await withMcpAudit(
        { toolName: "list_modules", actor },
        async () => {
          const result = await listRunModules(actor);
          return {
            response: jsonToolResponse(result),
            audit: {
              workspaceId: result.workspaceId,
              programRunId: result.runId,
              resultMetadata: { moduleCount: result.modules.length },
            },
          };
        },
      );
      return response;
    },
  );

  mcp.registerTool(
    "get_module_status",
    {
      title: "Get module status",
      description:
        "Reads the current Run/Branch/Module/Attempt state for one Module, identified by its stable moduleKey.",
      inputSchema: MODULE_KEY_SHAPE,
    },
    async (args) => {
      const response = await withMcpAudit(
        {
          toolName: "get_module_status",
          actor,
          requestMetadata: { moduleKey: args.moduleKey },
        },
        async () => {
          const runModule = await getRunModuleByKey(actor, args);
          return {
            response: jsonToolResponse(runModule),
            audit: {
              workspaceId: runModule.workspaceId,
              programRunId: runModule.programRunId,
              programRunBranchId: runModule.programRunBranchId,
              programRunModuleId: runModule.id,
              moduleAttemptId: runModule.activeAttemptId,
              resultMetadata: {
                moduleKey: runModule.moduleKey,
                status: runModule.status,
              },
            },
          };
        },
      );
      return response;
    },
  );

  mcp.registerTool(
    "get_module_context",
    {
      title: "Get module context",
      description:
        "Loads a Module's active/display Attempt, every active Question joined with displayAttempt's Responses (for reading), bound facilitator/artifact_generator prompts (follow these for the module's interview script), the resume point on the write Attempt, and Artifact metadata — including each Artifact's locked output_config.templateMarkdown, so save_artifact's headings can be copied exactly rather than reconstructed from the prompt text. When activeAttemptId is null after validation_failed, displayAttempt still surfaces the failed Attempt's answers and artefacts. When activeAttempt is a fresh empty Retry, displayAttempt is the based_on Attempt so prior answers remain visible — call start_module_attempt without inventing basedOnAttemptId.",
      inputSchema: MODULE_KEY_SHAPE,
    },
    async (args) => {
      const response = await withMcpAudit(
        {
          toolName: "get_module_context",
          actor,
          requestMetadata: { moduleKey: args.moduleKey },
        },
        async () => {
          const context = await getModuleContext(actor, args);
          return {
            response: jsonToolResponse(context),
            audit: {
              workspaceId: context.runModule.workspaceId,
              programRunId: context.runModule.programRunId,
              programRunBranchId: context.runModule.programRunBranchId,
              programRunModuleId: context.runModule.id,
              moduleAttemptId: context.activeAttempt?.id ?? null,
              resultMetadata: {
                moduleKey: context.runModule.moduleKey,
                resumeQuestionKey: context.resumeQuestionKey,
              },
            },
          };
        },
      );
      return response;
    },
  );

  mcp.registerTool(
    "get_artifact",
    {
      title: "Get artifact",
      description:
        "Reads an authorised Artifact's latest submitted metadata and stored content through StorageService.",
      inputSchema: ARTIFACT_KEY_SHAPE,
    },
    async (args) => {
      const response = await withMcpAudit(
        {
          toolName: "get_artifact",
          actor,
          requestMetadata: {
            attemptId: args.attemptId,
            artifactKey: args.artifactKey,
          },
        },
        async () => {
          const result = await getArtifactSubmission(actor, args);
          // Resolved after the read succeeds, and tolerated if it fails —
          // a bad attemptId already produced its own NOT_FOUND above; this
          // second lookup exists purely to enrich the audit row with the
          // full Run/Branch/Module hierarchy (see resolveAttemptRunContext's
          // own comment), never to gate the tool's actual result.
          const hierarchy = await resolveAttemptRunContext(
            actor,
            args.attemptId,
          ).catch(() => null);
          return {
            response: jsonToolResponse(result),
            audit: {
              workspaceId: hierarchy?.workspaceId ?? null,
              programRunId: hierarchy?.programRunId ?? null,
              programRunBranchId: hierarchy?.programRunBranchId ?? null,
              programRunModuleId: hierarchy?.programRunModuleId ?? null,
              moduleAttemptId: args.attemptId,
              resultMetadata: {
                artifactKey: args.artifactKey,
                found: result !== null,
                versionNumber: result?.submission.versionNumber ?? null,
              },
            },
          };
        },
      );
      return response;
    },
  );

  mcp.registerTool(
    "get_prep_document",
    {
      title: "Get prep document",
      description:
        "Reads one Founder-uploaded prep document listed in get_module_context's prepDocuments. Text formats (Markdown, plain text, CSV, RTF) are returned inline as `content`. Binary formats (PDF, Word, images) are NOT converted — they come back with `readable: false` and no content, because this server does not extract text. When a document is not readable, say so plainly and ask the Founder to paste the relevant part; never infer what a file contains from its filename.",
      inputSchema: PREP_DOCUMENT_SHAPE,
    },
    async (args) => {
      const response = await withMcpAudit(
        {
          toolName: "get_prep_document",
          actor,
          requestMetadata: { prepDocumentId: args.prepDocumentId },
        },
        async () => {
          const { document, content } = await readPrepDocument(
            actor,
            args.prepDocumentId,
          );
          const readable = INLINE_TEXT_CONTENT_TYPES.has(document.contentType);

          return {
            response: jsonToolResponse({
              id: document.id,
              filename: document.filename,
              contentType: document.contentType,
              sizeBytes: document.sizeBytes,
              readable,
              content: readable ? content.toString("utf8") : null,
              note: readable
                ? document.note
                : `This server does not extract text from ${document.contentType}. ` +
                  "Tell the Founder you cannot read this file and ask them to paste the part that matters.",
            }),
            audit: {
              workspaceId: null,
              programRunId: null,
              programRunBranchId: null,
              programRunModuleId: document.programRunModuleId,
              moduleAttemptId: null,
              resultMetadata: {
                filename: document.filename,
                contentType: document.contentType,
                readable,
              },
            },
          };
        },
      );
      return response;
    },
  );
}
