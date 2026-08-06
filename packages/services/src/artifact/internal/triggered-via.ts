import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { resolveMcpProviderTag } from "@ai-catalyst/contracts/actor-context";
import type { ArtifactValidationTriggeredVia } from "@ai-catalyst/shared";

// Role takes priority over source: an admin actor calling over the web
// still maps to 'admin' (the more specific, more authoritative fact),
// not 'website'. This is what keeps triggered_via='website' structurally
// unreachable for V1's runOfficialValidation (see artifact/index.ts for
// the full reasoning) without this mapper needing to special-case
// validation_kind on its own — the same priority order is correct for
// draft_check too (an admin manually running a draft check should still
// be recorded as 'admin', not 'website').
export function resolveValidationTriggeredVia(actor: ActorContext): ArtifactValidationTriggeredVia {
  if (actor.role === "admin") {
    return "admin";
  }
  if (actor.source === "system") {
    return "system";
  }
  if (actor.source === "mcp") {
    return "mcp";
  }
  return "website";
}

// module_events.actor_type domain: user | mcp | system | admin (validator reserved for future use).
export type ArtifactEventActorType = "user" | "mcp" | "system" | "admin";

export function resolveArtifactEventActorType(actor: ActorContext): ArtifactEventActorType {
  if (actor.role === "admin") {
    return "admin";
  }
  if (actor.source === "system") {
    return "system";
  }
  if (actor.source === "mcp") {
    return "mcp";
  }
  return "user";
}

// module_events.source_provider's check constraint
// (website/claude/openai/other/system, nullable) has no 'admin' or 'mcp'
// value at all — a narrower domain than actor_type above — so an admin
// actor still falls back to 'website' here specifically, while an
// mcp-sourced actor records which AI client it actually was.
export type ArtifactEventSourceProvider =
  | "website"
  | "claude"
  | "openai"
  | "other"
  | "system";

export function resolveArtifactEventSourceProvider(
  actor: ActorContext,
): ArtifactEventSourceProvider {
  if (actor.source === "system") {
    return "system";
  }
  if (actor.source === "mcp") {
    return resolveMcpProviderTag(actor);
  }
  return "website";
}
