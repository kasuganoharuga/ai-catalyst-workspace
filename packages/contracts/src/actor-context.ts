// The single identity shape passed into every packages/services call.
// apps/web derives it from the Better Auth session; apps/mcp derives it
// from the verified platform Bearer token (verifyMcpBearerToken). MCP tools
// are stateless — this context travels with every request.

export type ActorRole = "pending" | "founder" | "mentor" | "admin";

// Which transport authenticated this request. Not itself an authorization
// check (role/scopes are) — services that need to distinguish MCP-originated
// calls from web ones (e.g. to require a scope) branch on this field.
export type ActorSource = "web" | "mcp" | "system";

// Which AI client is on the other end of an MCP request, matching
// `mcp_tool_audit_logs.provider`. Derived from the OAuth client's registered
// redirect host (mcpProviderForRedirectUris in packages/services/mcp-auth),
// never from its self-declared name — Dynamic Client Registration is
// unauthenticated, so `client_name` is free text anyone can choose, while
// the redirect host is where authorization codes actually get delivered.
//
// "other" is not a failure: registration is open, so a client that is
// neither Claude nor ChatGPT is a legitimate thing to record honestly
// rather than force into one of the two known brands.
export type McpProvider = "claude" | "openai" | "other";

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
  // Which AI client that client_id belongs to, when source is "mcp". Audit
  // metadata, never an authorization input — a client cannot gain or lose
  // access by looking like Claude rather than ChatGPT.
  provider?: McpProvider;
  // Correlates a single request across service-layer log lines; not an
  // authorization input. Prefer one value per inbound HTTP/MCP request.
  traceId?: string;
  // Per-operation correlation (e.g. one MCP tool call, one web server
  // action). Distinct from traceId when a single request fans out into
  // multiple audited operations. Also stored on module_events when set.
  requestId?: string;
}

/**
 * The provenance value to record for an MCP-sourced actor.
 *
 * Every Service module maps its own provenance column independently (see
 * the "don't share mappers across modules" comments in artifact/internal
 * and storage/index.ts) because each column has a different enum domain.
 * This is not that mapper — it is only the provider-name half, which is
 * identical everywhere and was previously duplicated as a hardcoded
 * "claude" in four places. Callers still decide what to do for web,
 * system, and admin actors themselves.
 *
 * `provider` is optional on ActorContext, so an MCP actor built by hand
 * (older test fixtures) has none. That resolves to "other" rather than
 * defaulting to a brand: an unidentified client is exactly what "other"
 * means, and guessing "claude" is the bug this replaces.
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
