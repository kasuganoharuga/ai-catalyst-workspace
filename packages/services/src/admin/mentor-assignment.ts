import type { ActorContext } from "@ai-catalyst/contracts/actor-context";

import { recordAccountEvent } from "@ai-catalyst/services/audit/account-events";
import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import { parseEntityIdOrNotFound } from "@ai-catalyst/services/internal/entity-id";
import { withTransaction } from "@ai-catalyst/services/internal/transaction";

/**
 * Assign or clear the Mentor on an existing Founder workspace
 * (`workspaces.mentor_user_id`). Null clears the binding.
 */
export async function assignWorkspaceMentor(
  actor: ActorContext,
  input: { workspaceId: string; mentorUserId: string | null },
): Promise<void> {
  assertRole(actor, ["admin"]);

  const workspaceId = parseEntityIdOrNotFound(
    input.workspaceId,
    "Workspace not found.",
  );

  let mentorUserId: string | null = null;
  if (input.mentorUserId !== null) {
    mentorUserId = parseEntityIdOrNotFound(
      input.mentorUserId,
      "Mentor not found.",
    );
  }

  await withTransaction(async (client) => {
    const workspaceResult = await client.query<{
      id: string;
      founder_user_id: string;
      kind: "live" | "sandbox";
    }>(
      `select id, founder_user_id, kind from workspaces where id = $1 for update`,
      [workspaceId],
    );
    if (workspaceResult.rowCount === 0) {
      throw new ServiceError("NOT_FOUND", "Workspace not found.");
    }
    if (workspaceResult.rows[0].kind === "sandbox") {
      // workspaces_sandbox_has_no_mentor backs this up at the DB level —
      // this is just the readable error instead of a raw constraint
      // violation.
      throw new ServiceError(
        "VALIDATION_ERROR",
        "A Mentor's own founder-preview sandbox cannot be assigned a Mentor.",
      );
    }

    if (mentorUserId !== null) {
      const mentorResult = await client.query<{
        id: string;
        role: string;
        deleted_at: Date | null;
      }>(`select id, role, deleted_at from users where id = $1 for update`, [
        mentorUserId,
      ]);
      const mentor = mentorResult.rows[0];
      if (!mentor || mentor.deleted_at !== null || mentor.role !== "mentor") {
        throw new ServiceError("NOT_FOUND", "Mentor not found.");
      }

      if (mentor.id === workspaceResult.rows[0].founder_user_id) {
        throw new ServiceError(
          "VALIDATION_ERROR",
          "A founder cannot be their own mentor.",
        );
      }
    }

    await client.query(
      `update workspaces
       set mentor_user_id = $1, updated_at = now()
       where id = $2`,
      [mentorUserId, workspaceId],
    );
  });

  // Outside the transaction: a committed change that failed to log is better
  // than a logged change that rolled back.
  recordAccountEvent("account_workspace_mentor_changed", {
    actor,
    workspaceId,
    mentorUserId,
  });
}
