// Minimal external DTO for a Founder's Workspace, first needed by
// packages/services/src/invitation (PR 1.2) when a Founder Invitation is
// accepted. PR 1.3's WorkspaceService will extend this shape (status,
// mentor binding, timestamps, etc.) once it exists — deliberately kept
// minimal here rather than guessing at that future shape.
export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
}
