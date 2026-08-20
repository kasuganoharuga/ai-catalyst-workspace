// Mirrors the `program_runs.status` check constraint in
// infra/database/migrations/0001_aidb_v5_baseline.sql. getOrCreateProgramRun
// only ever writes "active" — the remaining values exist in the schema for
// later PRs (pause/complete/archive flows) but are represented here now so
// the DTO never needs to widen later just because a new write path appears.
export type ProgramRunStatus =
  "draft" | "active" | "paused" | "completed" | "archived";

// External DTO — always JSON-safe (ISO string timestamps, never `Date`),
// same convention as `Venture`. Mapped once at the Service boundary.
// `activeBranchId` is nullable in the database (the FK is added as a
// deferred constraint so a Run row can exist before its first Branch does),
// but every Run returned by getOrCreateProgramRun already has one — a null
// here downstream of that call would indicate a broken invariant, not a
// normal state.
export interface ProgramRun {
  id: string;
  workspaceId: string;
  ventureId: string;
  programVersionId: string;
  activeBranchId: string | null;
  runNumber: number;
  name: string | null;
  status: ProgramRunStatus;
  startedByUserId: string | null;
  startedAt: string | null;
  pausedAt: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
