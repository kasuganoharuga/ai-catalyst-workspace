import type { ModuleCompletionMode, ModuleType } from "./module-catalog.js";

// Mirrors the `program_run_modules.status` check constraint in
// infra/database/migrations/0001_aidb_v5_baseline.sql — a Run-scoped
// state, distinct from `ModuleCatalogStatus` (which only ever reflects
// the Program Version's own `live`/`coming_soon` publication state, with
// no notion of a particular Founder's progress).
export type RunModuleStatus =
  | "locked"
  | "inherited"
  | "available"
  | "in_progress"
  | "ready_to_unlock"
  | "completed";

// External DTO — always JSON-safe (ISO string timestamps, never `Date`),
// same convention as `ProgramRun`/`ModuleAttempt`. Mapped once at the
// Service boundary (packages/services/src/workflow). Carries the full
// Run/Branch/Module id chain so callers (in particular apps/mcp's audit
// wrapper) never need a second lookup just to populate
// `mcp_tool_audit_logs`' run/branch/module columns.
export interface RunModuleSummary {
  id: string;
  workspaceId: string;
  programRunId: string;
  programRunBranchId: string;
  moduleDefinitionId: string;
  moduleKey: string;
  title: string;
  sequenceIndex: number;
  moduleType: ModuleType;
  completionMode: ModuleCompletionMode;
  status: RunModuleStatus;
  activeAttemptId: string | null;
  acceptedAttemptId: string | null;
  unlockedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  // True when module_definitions is archived but this Run still has a row — kept for history, excluded from progression/unlock counts.
  isArchivedDefinition: boolean;
}
