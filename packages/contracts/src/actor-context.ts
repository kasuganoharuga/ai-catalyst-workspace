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
}): ActorContext {
  return {
    userId: params.userId,
    role: params.role,
    source: "web",
    scopes: [],
    traceId: params.traceId,
    requestId: params.requestId,
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
  };
}
