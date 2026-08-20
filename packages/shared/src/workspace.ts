// Mirrors workspaces.status from the baseline schema.
export type WorkspaceStatus = "active" | "suspended" | "archived";

// External DTO for a Founder's Workspace.
export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  status: WorkspaceStatus;
}
