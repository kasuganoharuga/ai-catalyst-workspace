import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { loggerForService } from "@ai-catalyst/observability/logger";
import { SERVICE_NAMES } from "@ai-catalyst/observability/service-names";

const log = loggerForService(SERVICE_NAMES.services);

/**
 * Who was let into the platform, who was locked out, and who did it.
 *
 * Structured logs rather than a table, deliberately. While onboarding is
 * manual — an admin issues an invitation code or a temporary password and
 * hands it over out of band, because there is no email delivery — these
 * events are the only record that any of it happened. A table would need a
 * retention policy, an access story and a migration; a log lands in
 * CloudWatch immediately and the observability module already builds metric
 * filters keyed on `$.event` (infra/aws/terraform/modules/observability).
 * Promote this to a real table when the trail needs to be queryable in-app
 * or survive log retention, not before.
 *
 * Distinct from `recordMcpToolCall` in ./index.ts: that one writes
 * `mcp_tool_audit_logs` for agent traffic. This covers account lifecycle,
 * which is mostly human traffic and has no table.
 *
 * These are notable-but-expected events, so they log at info. Failures of the
 * underlying action log separately at error from the call site.
 */
export type AccountAuditEvent =
  | "account_invitation_created"
  | "account_invitation_revoked"
  | "account_invitation_accepted"
  | "account_password_reset_by_admin"
  | "account_soft_deleted"
  | "account_workspace_mentor_changed";

export interface AccountAuditFields {
  /** Who performed it. */
  actor: ActorContext;
  /** Who it was done to, when that differs from the actor. */
  targetUserId?: string | null;
  invitationId?: string | null;
  inviteRole?: "founder" | "mentor" | null;
  workspaceId?: string | null;
  /** Mentor being bound, or null when a binding is being cleared. */
  mentorUserId?: string | null;
}

/**
 * Identifiers only — never an email address, and never the credential itself.
 *
 * `email` is a denied content key (packages/observability/denied-keys.json),
 * so an email field would be written as `[REDACTED]` and carry nothing. User
 * ids are the identifier that survives redaction, which makes them the only
 * useful subject for this trail; resolve them against `users` when reading it.
 */
export function recordAccountEvent(
  event: AccountAuditEvent,
  fields: AccountAuditFields,
): void {
  log.info({
    event,
    actor_user_id: fields.actor.userId,
    actor_role: fields.actor.role,
    target_user_id: fields.targetUserId ?? null,
    invitation_id: fields.invitationId ?? null,
    invite_role: fields.inviteRole ?? null,
    workspace_id: fields.workspaceId ?? null,
    mentor_user_id: fields.mentorUserId ?? null,
  });
}
