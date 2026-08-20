// Venture status/lifecycle values from the baseline schema. V1 write paths
// use active/archived and idea stage only; other values exist for future use.
export type VentureStatus = "active" | "paused" | "abandoned" | "archived";

export type VentureLifecycleStage =
  "idea" | "validating" | "validated" | "company_formed";

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
  /** Claude Chat Project UUID from claude.ai/project/{id} — null until saved. */
  claudeProjectId: string | null;
}
