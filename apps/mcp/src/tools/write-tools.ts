import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { resolveAttemptRunContext } from "@ai-catalyst/services/workflow";
import { saveFounderResponse, submitAttempt } from "@ai-catalyst/services/attempt";
import { saveArtifactSubmission } from "@ai-catalyst/services/artifact";

import { jsonToolResponse, withMcpAudit } from "./audit-wrapper.js";

// Registers the 3 write MCP capabilities from source doc §21:
// save_founder_input, save_artifact, complete_module. Every handler here
// is a thin shell over an already-idempotent PR 2.4/2.6 Service function
// — no new business/state-machine logic is added at this layer
// (architecture.mdc rule 1). `complete_module` deliberately only wraps
// `submitAttempt`: Official Validation (`runOfficialValidation`) is
// system/admin-only and is never reachable from any MCP tool, matching
// this PR's "MCP 请求 official validation 被数据库或 Service 权限矩阵拒绝"
// acceptance criterion.

const RESPONSE_STATUS_VALUES = ["answered", "skipped", "not_applicable", "needs_follow_up"] as const;

const SAVE_FOUNDER_INPUT_SHAPE = {
  attemptId: z.string().min(1),
  questionKey: z.string().min(1),
  responseStatus: z.enum(RESPONSE_STATUS_VALUES).optional(),
  value: z.unknown().optional(),
};

const SAVE_ARTIFACT_SHAPE = {
  attemptId: z.string().min(1),
  artifactKey: z.string().min(1),
  content: z.string(),
};

const ATTEMPT_ID_SHAPE = { attemptId: z.string().min(1) };

// Best-effort audit enrichment shared by all three write tools below —
// tolerated if it fails (a bad attemptId already produced its own
// NOT_FOUND from the real Service call above it), never allowed to mask
// the tool's actual result. See resolveAttemptRunContext's own comment
// for why this second lookup is necessary at all.
async function resolveAuditHierarchy(actor: ActorContext, attemptId: string) {
  return resolveAttemptRunContext(actor, attemptId).catch(() => null);
}

export function registerWriteTools(mcp: McpServer, actor: ActorContext): void {
  mcp.registerTool(
    "save_founder_input",
    {
      title: "Save founder input",
      description:
        "Validates and persists a Founder's structured answer to one Question within an Attempt. Idempotent for the same (attemptId, questionKey).",
      inputSchema: SAVE_FOUNDER_INPUT_SHAPE,
    },
    async (args) => {
      const response = await withMcpAudit(
        {
          toolName: "save_founder_input",
          actor,
          requestMetadata: { attemptId: args.attemptId, questionKey: args.questionKey },
        },
        async () => {
          const result = await saveFounderResponse(actor, args);
          const hierarchy = await resolveAuditHierarchy(actor, result.moduleAttemptId);
          return {
            response: jsonToolResponse(result),
            audit: {
              workspaceId: hierarchy?.workspaceId ?? null,
              programRunId: hierarchy?.programRunId ?? null,
              programRunBranchId: hierarchy?.programRunBranchId ?? null,
              programRunModuleId: hierarchy?.programRunModuleId ?? null,
              moduleAttemptId: result.moduleAttemptId,
              resultMetadata: {
                questionKey: result.questionKey,
                responseStatus: result.responseStatus,
              },
            },
          };
        },
      );
      return response;
    },
  );

  mcp.registerTool(
    "save_artifact",
    {
      title: "Save artifact",
      description:
        "Stores a new version of an Artifact's content through StorageService and creates its versioned submission. Hash-idempotent: an identical resubmission returns the existing version unchanged.",
      inputSchema: SAVE_ARTIFACT_SHAPE,
    },
    async (args) => {
      const response = await withMcpAudit(
        {
          toolName: "save_artifact",
          actor,
          requestMetadata: { attemptId: args.attemptId, artifactKey: args.artifactKey },
        },
        async () => {
          const result = await saveArtifactSubmission(actor, args);
          const hierarchy = await resolveAuditHierarchy(actor, result.moduleAttemptId);
          return {
            response: jsonToolResponse(result),
            audit: {
              workspaceId: hierarchy?.workspaceId ?? null,
              programRunId: hierarchy?.programRunId ?? null,
              programRunBranchId: hierarchy?.programRunBranchId ?? null,
              programRunModuleId: hierarchy?.programRunModuleId ?? null,
              moduleAttemptId: result.moduleAttemptId,
              resultMetadata: {
                artifactKey: args.artifactKey,
                versionNumber: result.versionNumber,
                status: result.status,
              },
            },
          };
        },
      );
      return response;
    },
  );

  mcp.registerTool(
    "complete_module",
    {
      title: "Complete module",
      description:
        "Submits an Attempt for review — the only state transition an MCP-sourced Actor may request. Never triggers Official Validation or Mentor acceptance.",
      inputSchema: ATTEMPT_ID_SHAPE,
    },
    async (args) => {
      const response = await withMcpAudit(
        { toolName: "complete_module", actor, requestMetadata: { attemptId: args.attemptId } },
        async () => {
          const result = await submitAttempt(actor, args);
          const hierarchy = await resolveAuditHierarchy(actor, result.id);
          return {
            response: jsonToolResponse(result),
            audit: {
              workspaceId: hierarchy?.workspaceId ?? null,
              programRunId: hierarchy?.programRunId ?? null,
              programRunBranchId: hierarchy?.programRunBranchId ?? null,
              programRunModuleId: hierarchy?.programRunModuleId ?? null,
              moduleAttemptId: result.id,
              resultMetadata: { status: result.status },
            },
          };
        },
      );
      return response;
    },
  );
}
