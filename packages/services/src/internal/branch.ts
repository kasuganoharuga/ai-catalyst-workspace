import type { ActorRole } from "@ai-catalyst/contracts/actor-context";

import { ServiceError } from "@ai-catalyst/services/errors";

// Mirrors the `program_run_branches.created_via` check constraint in
// infra/database/migrations/0001_aidb_v5_baseline.sql. "system" is not
// reachable through this mapping — it is reserved for rows a background
// job inserts directly, never for a Branch created on behalf of an
// authenticated actor.
export type BranchCreatedVia = "website" | "admin" | "system";

// package.json export: Turbopack cross-file resolution only — not public API (see internal/slug.ts).
//
// Exhaustive switch so a newly admitted role fails loudly instead of recording wrong created_via.
export function mapBranchCreatedVia(role: ActorRole): BranchCreatedVia {
  switch (role) {
    case "founder":
      return "website";
    case "admin":
      return "admin";
    case "mentor":
    case "pending":
      throw new ServiceError(
        "FORBIDDEN",
        `Role "${role}" is not permitted to create a Program Run Branch.`,
      );
    default: {
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}
