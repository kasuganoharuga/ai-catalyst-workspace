import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { resolveAttemptRunContext } from "@ai-catalyst/services/workflow";
import {
  saveFounderResponse,
  startOrResumeAttempt,
} from "@ai-catalyst/services/attempt";
import { saveArtifactSubmission } from "@ai-catalyst/services/artifact";
import { completeModuleAttempt } from "@ai-catalyst/services/module/completion";
import { savePrepExtract } from "@ai-catalyst/services/prep";

import { jsonToolResponse, withMcpAudit } from "./audit-wrapper.js";

// Registers write MCP tools — thin shells over packages/services only.

const RESPONSE_STATUS_VALUES = [
  "answered",
  "skipped",
  "not_applicable",
  "needs_follow_up",
] as const;

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

const SAVE_PREP_EXTRACT_SHAPE = {
  programRunModuleId: z.string().min(1),
  filename: z.string().min(1),
  extractedText: z.string().min(1),
  note: z.string().optional(),
  documentKind: z.enum(["interview_transcript", "other"]).optional(),
  interviewCount: z.number().int().min(1).optional(),
};

const START_MODULE_ATTEMPT_SHAPE = {
  programRunModuleId: z.string().min(1),
  basedOnAttemptId: z.string().min(1).optional(),
};

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
    "start_module_attempt",
    {
      title: "Start or resume a module attempt",
      description:
        "Starts a Founder's first Attempt at a Module, resumes the one currently in progress, or starts a Retry after a failed/cancelled/rejected Attempt. Do not invent Attempt IDs — omit basedOnAttemptId and the Service picks the latest unused retryable Attempt. Optional basedOnAttemptId remains for callers that already know the source. Required before save_founder_input/save_artifact/complete_module can target a new Attempt.",
      inputSchema: START_MODULE_ATTEMPT_SHAPE,
    },
    async (args) => {
      const response = await withMcpAudit(
        {
          toolName: "start_module_attempt",
          actor,
          requestMetadata: {
            programRunModuleId: args.programRunModuleId,
            basedOnAttemptId: args.basedOnAttemptId ?? null,
          },
        },
        async () => {
          const result = await startOrResumeAttempt(actor, args);
          const hierarchy = await resolveAuditHierarchy(
            actor,
            result.attempt.id,
          );
          return {
            response: jsonToolResponse(result),
            audit: {
              workspaceId: hierarchy?.workspaceId ?? null,
              programRunId: hierarchy?.programRunId ?? null,
              programRunBranchId: hierarchy?.programRunBranchId ?? null,
              programRunModuleId: hierarchy?.programRunModuleId ?? null,
              moduleAttemptId: result.attempt.id,
              resultMetadata: {
                status: result.attempt.status,
                created: result.created,
              },
            },
          };
        },
      );
      return response;
    },
  );

  mcp.registerTool(
    "save_founder_input",
    {
      title: "Save founder input",
      description:
        "Validates and persists a Founder's structured answer to one Question within an Attempt. Idempotent for the same (attemptId, questionKey). For single_choice questions, value must be a plain option token from that question's options (e.g. \"assumed\") — not a CONFIRMED ANSWER envelope and not an arbitrary object.",
      inputSchema: SAVE_FOUNDER_INPUT_SHAPE,
    },
    async (args) => {
      const response = await withMcpAudit(
        {
          toolName: "save_founder_input",
          actor,
          requestMetadata: {
            attemptId: args.attemptId,
            questionKey: args.questionKey,
          },
        },
        async () => {
          const result = await saveFounderResponse(actor, args);
          const hierarchy = await resolveAuditHierarchy(
            actor,
            result.moduleAttemptId,
          );
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
        "Stores a new version of an Artifact's content through StorageService and creates its versioned submission. When the Artifact has a Validator, the locked-schema draft check runs before any Storage write — freestyle Markdown that fails the check is rejected with VALIDATION_ERROR (repair the named issues and retry). Hash-idempotent: an identical resubmission returns the existing version unchanged.",
      inputSchema: SAVE_ARTIFACT_SHAPE,
    },
    async (args) => {
      const response = await withMcpAudit(
        {
          toolName: "save_artifact",
          actor,
          requestMetadata: {
            attemptId: args.attemptId,
            artifactKey: args.artifactKey,
          },
        },
        async () => {
          const result = await saveArtifactSubmission(actor, args);
          const hierarchy = await resolveAuditHierarchy(
            actor,
            result.moduleAttemptId,
          );
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
    "save_prep_extract",
    {
      title: "Save prep extract",
      description:
        "Persists your own transcription of a file the Founder shared directly in this chat, for a Module with no website Documents step. Read the file yourself first (this server has no upload/parsing path for it); extractedText must be a faithful transcription of the original — preserve the Founder's own words and specific facts, not a condensed summary — and never the raw file bytes. There is no uploaded file behind this record, so this is the only copy: show the Founder what you extracted and get their confirmation before calling this, the same as any other save. Shows up in get_module_context's prepDocuments and is readable back via get_prep_document, same as an uploaded file. " +
        'Set documentKind to "interview_transcript" when what was shared is one or more customer interviews (omit it, or set "other", for anything else — a pitch deck, research notes, etc.). When documentKind is "interview_transcript", interviewCount is REQUIRED and must be the true number of distinct interviews contained in extractedText, not the number of files the Founder shared — if the Founder pasted several interviews into one message or one document, read it, separate the distinct interviews yourself, and report the actual count (e.g. extractedText containing three separate conversations is interviewCount: 3, even though it was shared as a single message). Getting this count right matters: some Modules (e.g. Module 4) will not let Solution work proceed until enough confirmed interview transcripts exist, and that count is computed by summing interviewCount across every interview_transcript document — an inflated or deflated count defeats the gate in both directions.',
      inputSchema: SAVE_PREP_EXTRACT_SHAPE,
    },
    async (args) => {
      const response = await withMcpAudit(
        {
          toolName: "save_prep_extract",
          actor,
          requestMetadata: { programRunModuleId: args.programRunModuleId },
        },
        async () => {
          const result = await savePrepExtract(actor, args);
          return {
            response: jsonToolResponse(result),
            audit: {
              workspaceId: null,
              programRunId: null,
              programRunBranchId: null,
              programRunModuleId: result.programRunModuleId,
              moduleAttemptId: null,
              resultMetadata: {
                filename: result.filename,
                prepDocumentId: result.id,
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
        "Declares a Founder's Attempt done: submits it, then runs Official Validation (with an internally-forced system actor, never the caller's own authority). On a passing validation the Attempt stops at ready_for_review with awaitingConfirmation=true — completing the Module and unlocking the next one is a separate Founder action on the website, never something MCP can do. Every passing Attempt shares that success path (no auto-cancel / auto-retry). On failure, validationErrors lists the named checks to repair. Never lets an MCP-sourced Actor force a Mentor acceptance.",
      inputSchema: ATTEMPT_ID_SHAPE,
    },
    async (args) => {
      const response = await withMcpAudit(
        {
          toolName: "complete_module",
          actor,
          requestMetadata: { attemptId: args.attemptId },
        },
        async () => {
          const result = await completeModuleAttempt(actor, args);
          const hierarchy = await resolveAuditHierarchy(
            actor,
            result.attempt.id,
          );
          return {
            response: jsonToolResponse(result),
            audit: {
              workspaceId: hierarchy?.workspaceId ?? null,
              programRunId: hierarchy?.programRunId ?? null,
              programRunBranchId: hierarchy?.programRunBranchId ?? null,
              programRunModuleId: hierarchy?.programRunModuleId ?? null,
              moduleAttemptId: result.attempt.id,
              resultMetadata: {
                status: result.attempt.status,
                passed: result.passed,
                moduleCompleted: result.moduleCompleted,
                awaitingConfirmation: result.awaitingConfirmation,
                validationErrorCount: result.validationErrors.length,
                nextModuleUnlocked:
                  result.nextModuleUnlocked?.moduleKey ?? null,
              },
            },
          };
        },
      );
      return response;
    },
  );
}
