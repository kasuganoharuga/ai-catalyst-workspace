import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { logger } from "../logger.js";
import { getNextModuleId } from "../modules/manifest.js";
import { getModuleDefinition } from "../modules/moduleDefinitions.js";
import { writeFileAtomic } from "../storage/jsonStore.js";
import { dataDirectory, uploadsProjectDirectory } from "../storage/paths.js";
import {
  findLatestSubmission,
  findModuleState,
  findSubmissionsForModule,
  getProjectState,
  getSubmissions,
  saveProjectState,
  saveSubmissions,
} from "../storage/repository.js";
import type { SubmissionRecord } from "../storage/types.js";
import { validateArtefactContent } from "../validation/artefactValidator.js";
import { renderPocPage } from "./page.js";

const uploadBodySchema = z.object({
  module_id: z.string().min(1),
  filename: z.string().min(1),
  content: z.string().min(1),
});

/**
 * Optional shared-secret check, `/api/upload` and `/api/unlock` only -
 * never applied to `/mcp`, which stays fully read-only and keyless. If
 * POC_ADMIN_KEY is unset, this is a no-op (zero-config default for local
 * testing). This is a lightweight testing convenience, not real auth - see
 * README "Known tradeoffs: tool boundaries vs authorization".
 */
function checkAdminKey(req: Request): { ok: true } | { ok: false; status: number; body: Record<string, unknown> } {
  const expected = process.env.POC_ADMIN_KEY;
  if (!expected) {
    return { ok: true };
  }
  const provided = req.header("X-POC-Admin-Key");
  if (provided !== expected) {
    return {
      ok: false,
      status: 401,
      body: { error_code: "INVALID_ADMIN_KEY", message: "Missing or incorrect X-POC-Admin-Key header." },
    };
  }
  return { ok: true };
}

function asyncHandler(
  handler: (req: Request, res: Response) => Promise<void | Response>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    handler(req, res).catch(next);
  };
}

export function registerWebRoutes(app: Express): void {
  const router = express.Router();

  router.get("/poc", (_req, res) => {
    res.type("html").send(renderPocPage());
  });

  router.get("/api/state", asyncHandler(handleGetState));
  router.post("/api/upload", asyncHandler(handleUpload));
  router.post("/api/unlock", asyncHandler(handleUnlock));

  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error("Unhandled error in web route", { error: String(err) });
    if (!res.headersSent) {
      res.status(500).json({ error_code: "INTERNAL_ERROR", message: "Unexpected server error." });
    }
  });

  app.use(router);
  app.get("/", (_req, res) => res.redirect("/poc"));
}

async function handleGetState(_req: Request, res: Response): Promise<void> {
  const state = await getProjectState();
  const submissions = await getSubmissions();
  res.json({ project_state: state ?? null, submissions });
}

/**
 * The only path in this POC that can create a real submission and move a
 * module out of in_progress/needs_revision. Filename lockdown mirrors the
 * old stdio POC's save_artifact tool: the server owns the naming rule, not
 * the uploader.
 */
async function handleUpload(req: Request, res: Response): Promise<void> {
  const adminCheck = checkAdminKey(req);
  if (!adminCheck.ok) {
    res.status(adminCheck.status).json(adminCheck.body);
    return;
  }

  const parsed = uploadBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error_code: "INVALID_REQUEST_BODY", message: parsed.error.message });
    return;
  }
  const { module_id: moduleId, filename, content } = parsed.data;

  const state = await getProjectState();
  if (!state) {
    res.status(404).json({ error_code: "PROJECT_NOT_SEEDED", message: "No project state found. Run the seed script." });
    return;
  }

  const moduleState = findModuleState(state, moduleId);
  if (!moduleState) {
    res.status(404).json({ error_code: "UNKNOWN_MODULE", message: `Module ${moduleId} was not found.` });
    return;
  }
  if (moduleState.status !== "in_progress" && moduleState.status !== "needs_revision") {
    res.status(409).json({
      error_code: "MODULE_NOT_ACCEPTING_UPLOADS",
      message: `Module ${moduleId} is "${moduleState.status}" and is not currently accepting uploads.`,
    });
    return;
  }

  const definition = getModuleDefinition(moduleId);
  if (!definition) {
    res.status(500).json({
      error_code: "MODULE_DEFINITION_NOT_AVAILABLE",
      message: `No definition exists for module ${moduleId} in this POC.`,
    });
    return;
  }

  if (path.basename(filename) !== filename) {
    res.status(400).json({ error_code: "INVALID_FILENAME", message: "filename must not contain directory components." });
    return;
  }
  if (filename !== definition.requiredArtifactFilename) {
    res.status(400).json({
      error_code: "UNEXPECTED_ARTIFACT_FILENAME",
      message: `Expected ${definition.requiredArtifactFilename}.`,
    });
    return;
  }

  const priorSubmissions = await findSubmissionsForModule(state.project_id, moduleId);
  const nextVersion = priorSubmissions.reduce((max, submission) => Math.max(max, submission.version), 0) + 1;

  const { name, ext } = path.parse(filename);
  const versionedFilename = `${name}.v${nextVersion}${ext || ".md"}`;
  const finalPath = path.join(uploadsProjectDirectory(state.project_id), versionedFilename);

  await writeFileAtomic(finalPath, content);

  const { missing } = validateArtefactContent(content, definition);
  const validationStatus: "passed" | "failed" = missing.length === 0 ? "passed" : "failed";

  const submissionRecord: SubmissionRecord = {
    submission_id: randomUUID(),
    project_id: state.project_id,
    module_id: moduleId,
    version: nextVersion,
    filename,
    file_path: path.relative(dataDirectory(), finalPath).split(path.sep).join("/"),
    validation_status: validationStatus,
    issues: missing,
    uploaded_at: new Date().toISOString(),
  };

  // Same write-then-rollback discipline as the old stdio POC's
  // save_artifact: the uploaded file and its SubmissionRecord must stay
  // consistent even if the process dies mid-write.
  try {
    const allSubmissions = await getSubmissions();
    await saveSubmissions([...allSubmissions, submissionRecord]);
  } catch (error) {
    await fs.rm(finalPath, { force: true }).catch(() => undefined);
    throw error;
  }

  // Validation passed never means completed directly - only /api/unlock
  // can move a module to completed, and only after a human confirms.
  const newStatus: "ready_to_unlock" | "needs_revision" =
    validationStatus === "passed" ? "ready_to_unlock" : "needs_revision";
  const updatedModules = state.modules.map((entry) =>
    entry.module_id === moduleId ? { ...entry, status: newStatus } : entry,
  );
  await saveProjectState({ ...state, modules: updatedModules });

  res.json({
    module_id: moduleId,
    version: nextVersion,
    validation_status: validationStatus,
    issues: missing,
    module_status: newStatus,
  });
}

/**
 * Takes no target module from the request body at all - the server alone
 * decides which module (if any) is eligible, purely from manifest order.
 * This is what makes it impossible for a caller to unlock an arbitrary
 * module out of sequence.
 */
async function handleUnlock(req: Request, res: Response): Promise<void> {
  const adminCheck = checkAdminKey(req);
  if (!adminCheck.ok) {
    res.status(adminCheck.status).json(adminCheck.body);
    return;
  }

  const state = await getProjectState();
  if (!state) {
    res.status(404).json({ error_code: "PROJECT_NOT_SEEDED", message: "No project state found. Run the seed script." });
    return;
  }

  const readyModule = state.modules.find((entry) => entry.status === "ready_to_unlock");
  if (!readyModule) {
    res.status(409).json({ error_code: "NO_MODULE_READY", message: "No module is currently ready_to_unlock." });
    return;
  }

  // Defensive re-check: ready_to_unlock should only ever be set alongside a
  // passed submission, but this refuses to unlock if that invariant was
  // ever violated instead of trusting the status field alone.
  const latestSubmission = await findLatestSubmission(state.project_id, readyModule.module_id);
  if (!latestSubmission || latestSubmission.validation_status !== "passed") {
    res.status(409).json({
      error_code: "LATEST_SUBMISSION_NOT_PASSED",
      message: `Module ${readyModule.module_id} is ready_to_unlock but its latest submission did not pass validation.`,
    });
    return;
  }

  const nextModuleId = await getNextModuleId(readyModule.module_id);
  if (!nextModuleId) {
    res.status(409).json({
      error_code: "NO_NEXT_MODULE",
      message: `Module ${readyModule.module_id} has no next module in the manifest.`,
    });
    return;
  }

  const nextModuleState = findModuleState(state, nextModuleId);
  if (!nextModuleState) {
    res.status(409).json({
      error_code: "NEXT_MODULE_NOT_SEEDED",
      message: `Next module ${nextModuleId} has no state entry in this POC (only module-01 -> module-02 unlock is exercised).`,
    });
    return;
  }
  if (nextModuleState.status !== "locked") {
    res.status(409).json({
      error_code: "NEXT_MODULE_NOT_LOCKED",
      message: `Next module ${nextModuleId} is already "${nextModuleState.status}", not locked. Refusing a double-unlock.`,
    });
    return;
  }

  const updatedModules = state.modules.map((entry) => {
    if (entry.module_id === readyModule.module_id) {
      return { ...entry, status: "completed" as const };
    }
    if (entry.module_id === nextModuleId) {
      return { ...entry, status: "in_progress" as const };
    }
    return entry;
  });
  await saveProjectState({ ...state, modules: updatedModules });

  res.json({
    module_id: readyModule.module_id,
    status: "completed",
    unlocked_module: nextModuleId,
  });
}
