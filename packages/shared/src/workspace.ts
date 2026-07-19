// Mirrors the `workspaces.status` check constraint in
// infra/database/migrations/0001_aidb_v5_baseline.sql. Mentor-facing
// suspend/archive actions land in a later PR — this type just needs to
// exist wherever a Workspace row is read.
export type WorkspaceStatus = "active" | "suspended" | "archived";

// External DTO for a Founder's Workspace. First introduced minimally by
// packages/services/src/invitation (PR 1.2) when a Founder Invitation is
// accepted; extended with `status` in PR 1.3 now that WorkspaceService
// exists and write paths (Venture create/archive) need to gate on it.
export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  status: WorkspaceStatus;
}
