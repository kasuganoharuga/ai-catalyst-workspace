// The single identity shape passed into every packages/services call,
// regardless of caller: apps/web derives it from the Better Auth session,
// apps/mcp derives it from the verified platform Bearer token. Per
// architecture.mdc rule 5, MCP tools are stateless — this context travels
// with every request rather than being cached in a session.

export type ActorRole = "pending" | "founder" | "mentor" | "admin";

export interface ActorContext {
  userId: string;
  role: ActorRole;
}
