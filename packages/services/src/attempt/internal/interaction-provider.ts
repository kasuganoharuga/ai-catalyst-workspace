import type { ActorContext } from "@ai-catalyst/contracts/actor-context";

// Listed under "./attempt/internal/interaction-provider" in package.json
// only so Turbopack can resolve this module's cross-file imports (see
// internal/slug.ts for why) — not part of the intended public API.
//
// `ActorContext.source` is `"web" | "mcp" | "system"`, but the database
// columns that record how an interaction happened don't line up 1:1 with
// that: `module_responses.source_provider` only accepts
// `website`/`claude`/`openai` (no `system` — a system actor has no
// business writing a Founder's answer), while `module_attempts.started_via`
// accepts `website`/`claude`/`openai`/`system`. This mapper is the single
// place that bridges the two, kept inside packages/services/src/attempt
// rather than added to ActorContext itself.
export function resolveInteractionProvider(
  actor: ActorContext,
): "website" | "claude" | "system" {
  if (actor.source === "web") {
    return "website";
  }
  if (actor.source === "system") {
    return "system";
  }
  // V1: one MCP client — mcp maps to claude.
  return "claude";
}
