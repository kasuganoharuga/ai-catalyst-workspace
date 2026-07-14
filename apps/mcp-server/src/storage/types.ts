/**
 * Website-only mutation path: locked -> in_progress -> (needs_revision | ready_to_unlock) -> completed.
 * MCP tools can read every one of these but write none of them - only
 * src/web/routes.ts (POST /api/upload, POST /api/unlock) ever calls
 * saveProjectState.
 */
export type ModuleStatus = "locked" | "in_progress" | "needs_revision" | "ready_to_unlock" | "completed";

export type ModuleStateEntry = {
  module_id: string;
  status: ModuleStatus;
};

export type ProjectState = {
  project_id: string;
  project_name: string;
  modules: ModuleStateEntry[];
};

export type SubmissionRecord = {
  submission_id: string;
  project_id: string;
  module_id: string;
  version: number;
  filename: string;
  file_path: string;
  validation_status: "passed" | "failed";
  issues: string[];
  uploaded_at: string;
};
