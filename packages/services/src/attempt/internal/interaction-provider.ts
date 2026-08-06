import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { resolveMcpProviderTag } from "@ai-catalyst/contracts/actor-context";

// Listed under "./attempt/internal/interaction-provider" in package.json
// only so Turbopack can resolve this module's cross-file imports (see
// internal/slug.ts for why) — not part of the intended public API.
//
// `ActorContext.source` is `"web" | "mcp" | "system"`, but the database
// columns that record how an interaction happened don't line up 1:1 with
// that: `module_responses.source_provider` accepts
// `website`/`claude`/`openai`/`other` (no `system` — a system actor has no
// business writing a Founder's answer), while `module_attempts.started_via`
// also accepts `system`. This mapper is the single place that bridges the
// two, kept inside packages/services/src/attempt rather than added to
// ActorContext itself.
//
// The MCP branch reads `actor.provider` (see resolveMcpProviderTag) rather
// than the `claude` this used to hardcode. Migration 0011 added `other` to
// both columns so a third-party MCP client has an honest value.
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
