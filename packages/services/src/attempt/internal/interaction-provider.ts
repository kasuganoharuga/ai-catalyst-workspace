import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { resolveMcpProviderTag } from "@ai-catalyst/contracts/actor-context";

// package.json export for Turbopack only — not public API.
// Maps ActorContext to DB source_provider / started_via columns (no system on responses).
export function resolveInteractionProvider(
  actor: ActorContext,
): "website" | "claude" | "openai" | "other" | "system" {
  if (actor.source === "web") {
    return "website";
  }
  if (actor.source === "system") {
    return "system";
  }
  return resolveMcpProviderTag(actor);
}
