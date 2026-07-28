// The single identity shape passed into every packages/services call.
// apps/web derives it from the Better Auth session; apps/mcp derives it
// from the verified platform Bearer token (verifyMcpBearerToken). MCP tools
// are stateless — this context travels with every request.

export type ActorRole = "pending" | "founder" | "mentor" | "admin";

// Which transport authenticated this request. Not itself an authorization
// check (role/scopes are) — services that need to distinguish MCP-originated
// calls from web ones (e.g. to require a scope) branch on this field.
export type ActorSource = "web" | "mcp" | "system";

export interface ActorContext {
  userId: string;
  role: ActorRole;

  // Optional so existing test fixtures keep compiling. New code should use
  // createWebActorContext / createMcpActorContext, which always populate these.
  source?: ActorSource;
  // OAuth scopes granted to the underlying Bearer token — today always
  // `["mcp:connect", "offline_access"]` for an MCP actor. Authorization
  // checks must look for the scope they need rather than compare the whole
  // array, since `offline_access` governs token lifetime, not access.
  // Empty/undefined for a web session actor, which is not scope-restricted —
  // role is the only gate for those.
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
