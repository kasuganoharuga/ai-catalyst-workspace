import type { ActorRole } from "@ai-catalyst/contracts/actor-context";

import { ServiceError } from "@ai-catalyst/services/errors";

// Mirrors the `program_run_branches.created_via` check constraint in
// infra/database/migrations/0001_aidb_v5_baseline.sql. "system" is not
// reachable through this mapping — it is reserved for rows a background
// job inserts directly, never for a Branch created on behalf of an
// authenticated actor.
export type BranchCreatedVia = "website" | "admin" | "system";

// Listed under "./internal/branch" in package.json only so Turbopack can
// resolve this module's cross-file imports (see internal/slug.ts for why) —
// not part of the intended public API.
//
// An exhaustive switch (not a lookup with a silent default) so that if
// `assertRole` for a Branch-creating call is ever loosened to admit a role
// this mapping doesn't explicitly handle, that caller fails loudly with a
// ServiceError instead of the Branch silently recording the wrong
// created_via provenance for a source nobody has reviewed.
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
