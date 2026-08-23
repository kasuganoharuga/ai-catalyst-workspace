import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { effectiveRole } from "@ai-catalyst/contracts/actor-context";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import type { QueryExecutor } from "@ai-catalyst/services/internal/transaction";
import { assertMentorOwnsWorkspace } from "@ai-catalyst/services/mentor";
import { resolveFounderWorkspace } from "@ai-catalyst/services/workspace";

/**
 * NOT_FOUND for any scope violation, never FORBIDDEN — same enumeration-
 * safety convention as mentor/index.ts's assertMentorOwnsWorkspace.
 * Admin has platform-wide access, same allowance as
 * storage/internal/authorization.ts's assertGeneratedContentReader.
 */
export async function assertActorCanAccessWorkspace(
  actor: ActorContext,
  workspaceId: string,
  client: QueryExecutor,
): Promise<void> {
  assertRole(actor, ["founder", "mentor", "admin"]);
  // effectiveRole, not actor.role: a Mentor previewing the Founder flow
  // must reach their own sandbox's comment threads through this same
  // branch (via resolveFounderWorkspace, scoped to their real userId) —
  // same reasoning as storage/generated-text.ts's getGeneratedTextContent. The
  // mentor branch below requires kind = 'live' and would otherwise
  // NOT_FOUND them out of their own sandbox (sandboxes never have a
  // Mentor of their own — see workspaces_sandbox_has_no_mentor).
  if (effectiveRole(actor) === "founder") {
    const workspace = await resolveFounderWorkspace(actor, client);
    if (workspace.id !== workspaceId) {
      throw new ServiceError("NOT_FOUND", "Artifact not found.");
    }
    return;
  }
  if (actor.role === "mentor") {
    await assertMentorOwnsWorkspace(actor, workspaceId);
    return;
  }
  // admin: no further scope check.
}
