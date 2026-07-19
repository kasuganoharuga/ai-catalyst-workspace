// Mirrors the `ventures.status` / `ventures.lifecycle_stage` check
// constraints in infra/database/migrations/0001_aidb_v5_baseline.sql.
// PR 1.3 only ever writes `status: "active" | "archived"` and
// `lifecycle_stage: "idea"` (create/archive only) — the remaining values
// exist in the schema for later PRs but are represented here now so the
// DTO never needs to widen later just because a new write path appears.
export type VentureStatus = "active" | "paused" | "abandoned" | "archived";

export type VentureLifecycleStage =
  | "idea"
  | "validating"
  | "validated"
  | "company_formed";

// External DTO — always JSON-safe (ISO string timestamps, never `Date`),
// same convention as `Invitation`. Mapped once at the Service boundary.
export interface Venture {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  oneLiner: string | null;
  summary: string | null;
  lifecycleStage: VentureLifecycleStage;
  status: VentureStatus;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}
