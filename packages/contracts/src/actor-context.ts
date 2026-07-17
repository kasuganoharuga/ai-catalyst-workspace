// The single identity shape passed into every packages/services call,
// regardless of caller: apps/web derives it from the Better Auth session,
// apps/mcp derives it from the verified platform Bearer token (PR 2.2's
// `verifyMcpBearerToken`, packages/services/src/mcp-auth). Per
// architecture.mdc rule 5, MCP tools are stateless — this context travels
// with every request rather than being cached in a session.

export type ActorRole = "pending" | "founder" | "mentor" | "admin";

// Which transport authenticated this request. Not itself an authorization
// check (role/scopes are) — services that need to distinguish MCP-originated
// calls from web ones (e.g. to require a scope) branch on this field.
export type ActorSource = "web" | "mcp" | "system";

export interface ActorContext {
  userId: string;
  role: ActorRole;

  // `source`/`scopes`/`clientId`/`traceId` are all optional so that the many
  // pre-existing ActorContext literals across packages/services's test
  // suites (constructed before PR 2.2, with no OAuth concept at all) keep
  // compiling unchanged. New code should always go through
  // `createWebActorContext`/`createMcpActorContext` below rather than a
  // bare object literal, which always populate them.
  source?: ActorSource;
  // OAuth scopes granted to the underlying Bearer token (e.g.
  // `["mcp:connect"]`). Empty/undefined for a web session actor, which is
  // not scope-restricted — role is the only gate for those.
  scopes?: string[];
  // The OAuth client_id that requested the token, when source is "mcp".
  clientId?: string;
  // Correlates a single request across service-layer log lines; not an
  // authorization input.
  traceId?: string;
}

export function createWebActorContext(params: {
  userId: string;
  role: ActorRole;
  traceId?: string;
}): ActorContext {
  return {
    userId: params.userId,
    role: params.role,
    source: "web",
    scopes: [],
    traceId: params.traceId,
  };
}

export function createMcpActorContext(params: {
  userId: string;
  role: ActorRole;
  scopes: string[];
  clientId: string;
  traceId?: string;
}): ActorContext {
  return {
    userId: params.userId,
    role: params.role,
    source: "mcp",
    scopes: params.scopes,
    clientId: params.clientId,
    traceId: params.traceId,
  };
}
