import { readJsonArray, readJsonObject, writeJsonAtomic } from "./jsonStore.js";
import { projectStateFilePath, submissionsFilePath } from "./paths.js";
import type { ModuleStateEntry, ProjectState, SubmissionRecord } from "./types.js";

/**
 * This POC only ever has one project (demo-project-001), so project-state.json
 * is a single object, not an array to scan - unlike the old stdio POC's
 * projects.json.
 */
export async function getProjectState(): Promise<ProjectState | undefined> {
  return readJsonObject<ProjectState>(projectStateFilePath());
}

export async function saveProjectState(state: ProjectState): Promise<void> {
  await writeJsonAtomic(projectStateFilePath(), state);
}

export function findModuleState(state: ProjectState, moduleId: string): ModuleStateEntry | undefined {
  return state.modules.find((entry) => entry.module_id === moduleId);
}

export async function getSubmissions(): Promise<SubmissionRecord[]> {
  return readJsonArray<SubmissionRecord>(submissionsFilePath());
}

export async function saveSubmissions(records: SubmissionRecord[]): Promise<void> {
  await writeJsonAtomic(submissionsFilePath(), records);
}

export async function findSubmissionsForModule(
  projectId: string,
  moduleId: string,
): Promise<SubmissionRecord[]> {
  const records = await getSubmissions();
  return records.filter((record) => record.project_id === projectId && record.module_id === moduleId);
}

/** Highest-version submission for a module, or undefined if none has ever been uploaded. */
export async function findLatestSubmission(
  projectId: string,
  moduleId: string,
): Promise<SubmissionRecord | undefined> {
  const matching = await findSubmissionsForModule(projectId, moduleId);
  if (matching.length === 0) {
    return undefined;
  }
  return matching.reduce((latest, record) => (record.version > latest.version ? record : latest));
}
