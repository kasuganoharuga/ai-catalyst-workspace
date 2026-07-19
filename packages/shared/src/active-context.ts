// Mirrors `user_active_contexts` in
// infra/database/migrations/0001_aidb_v5_baseline.sql: records only the
// current UI selection. Per that table's own schema comment, this is
// never a basis for authorization — every write path must independently
// re-verify Workspace/Venture ownership and status.
export interface ActiveContext {
  workspaceId: string | null;
  ventureId: string | null;
}
