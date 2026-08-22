// Identity passed into every packages/services call — web from Better Auth,
// MCP from the verified Bearer token. Stateless: travels with each request.

export type ActorRole = "pending" | "founder" | "mentor" | "admin";

// Transport that authenticated the request — not an auth check; role/scopes are.
export type ActorSource = "web" | "mcp" | "system";

// MCP client brand for audit logs — from OAuth redirect host, not client_name.
// "other" is honest recording for non-Claude/ChatGPT clients, not a failure.
export type McpProvider = "claude" | "openai" | "other";

export interface ActorContext {
  userId: string;
  role: ActorRole;

  // Optional for legacy fixtures; prefer createWebActorContext / createMcpActorContext.
  source?: ActorSource;
  // MCP Bearer scopes; web actors are role-gated only.
  scopes?: string[];
  // OAuth client_id when source is "mcp".
  clientId?: string;
  // MCP client brand — audit metadata only, never authorization input.
  provider?: McpProvider;
  // One value per inbound HTTP/MCP request for log correlation.
  traceId?: string;
  // Per-operation correlation (tool call, server action); also on module_events.
  requestId?: string;

  /**
   * Founder-preview mode. Only ever "founder", and only ever set when
   * role === "mentor" — a Mentor previewing the Founder flow inside their
   * own sandbox Workspace (see packages/services/src/mentor/founder-preview.ts).
   * MUST be derived server-side from resolveFounderPreviewState (role='mentor'
   * AND a *current* sandbox Workspace exists for them) — never read from a
   * client-supplied value. It grants no access beyond that one sandbox:
   * every Founder-scoped service call still resolves scope via
   * resolveFounderWorkspace(actor), which for a Mentor resolves to
   * `founder_user_id = actor.userId and is_current_sandbox` — a Mentor may
   * have several sandbox Workspaces left over from starting over, but
   * workspaces_one_current_sandbox_per_mentor guarantees at most one is
   * ever current, so there is nothing else for that resolution to reach.
   * See effectiveRole().
   */
  actingAs?: Extract<ActorRole, "founder">;
}

/**
 * True only for a Mentor actively previewing the Founder flow — the one
 * case where `role` and `effectiveRole` disagree. Prefer this over
 * spelling out `actor.role === "mentor" && effectiveRole(actor) ===
 * "founder"` at call sites that need to know specifically "is this
 * preview," as opposed to `effectiveRole(actor) === "founder"`, which is
 * also true for a real Founder and is usually what a Founder-scoped
 * authorization check should test instead.
 */
export function isFounderPreview(actor: ActorContext): boolean {
  return actor.role === "mentor" && actor.actingAs === "founder";
}

/**
 * The role every packages/services authorization check should test against
 * — assertRole uses this, not actor.role directly. Equal to actor.role for
 * everyone except a Mentor in Founder-preview mode, where it reads
 * "founder". Deliberately does NOT let a Founder assertRole(["mentor"])
 * check pass while previewing: you cannot act as your own reviewer while
 * pretending to be reviewed.
 */
export function effectiveRole(actor: ActorContext): ActorRole {
  return actor.actingAs ?? actor.role;
}

/**
 * MCP provider tag for provenance columns — shared half of per-module mappers.
 * Missing provider resolves to "other", not a guessed brand.
 */
export function resolveMcpProviderTag(actor: ActorContext): McpProvider {
  return actor.provider ?? "other";
}

export function createWebActorContext(params: {
  userId: string;
  role: ActorRole;
  traceId?: string;
  requestId?: string;
  actingAs?: Extract<ActorRole, "founder">;
}): ActorContext {
  return {
    userId: params.userId,
    role: params.role,
    source: "web",
    scopes: [],
    traceId: params.traceId,
    requestId: params.requestId,
    actingAs: params.actingAs,
  };
}

export function createMcpActorContext(params: {
  userId: string;
  role: ActorRole;
  scopes: string[];
  clientId: string;
  provider: McpProvider;
  traceId?: string;
  requestId?: string;
  actingAs?: Extract<ActorRole, "founder">;
}): ActorContext {
  return {
    userId: params.userId,
    role: params.role,
    source: "mcp",
    scopes: params.scopes,
    clientId: params.clientId,
    provider: params.provider,
    traceId: params.traceId,
    requestId: params.requestId,
    actingAs: params.actingAs,
  };
}
