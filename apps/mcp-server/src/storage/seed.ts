import fs from "node:fs/promises";
import { fileExists, writeJsonAtomic } from "./jsonStore.js";
import { submissionsFilePath, uploadsProjectDirectory } from "./paths.js";
import { getProjectState, saveProjectState } from "./repository.js";

export const DEMO_PROJECT_ID = "demo-project-001";
export const DEMO_PROJECT_NAME = "Nobel AI";
export const DEMO_MODULE_1_ID = "module-01-pressure-test";
export const DEMO_MODULE_2_ID = "module-02-hmw";

/**
 * Idempotent seeder: never overwrites an existing project-state.json (so a
 * module already driven to needs_revision/ready_to_unlock/completed survives
 * a rerun). Only creates project-state.json and submissions.json when they
 * are completely absent.
 */
export async function ensureSeedData(): Promise<void> {
  const existingState = await getProjectState();
  if (!existingState) {
    await saveProjectState({
      project_id: DEMO_PROJECT_ID,
      project_name: DEMO_PROJECT_NAME,
      modules: [
        { module_id: DEMO_MODULE_1_ID, status: "in_progress" },
        { module_id: DEMO_MODULE_2_ID, status: "locked" },
      ],
    });
  }

  const submissionsPath = submissionsFilePath();
  if (!(await fileExists(submissionsPath))) {
    await writeJsonAtomic(submissionsPath, []);
  }

  await fs.mkdir(uploadsProjectDirectory(DEMO_PROJECT_ID), { recursive: true });
}
