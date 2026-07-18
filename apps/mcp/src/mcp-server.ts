import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { ActorContext } from "@ai-catalyst/contracts/actor-context";

import { registerReadTools } from "./tools/read-tools.js";
import { registerWriteTools } from "./tools/write-tools.js";

const SERVER_NAME = "ai-catalyst-mcp";
const SERVER_VERSION = "0.1.0";

/**
 * Builds a fresh `McpServer` instance for a single request, with every
 * PR 2.7 Tool registered against the already-verified `actor` for this
 * request (per architecture.mdc rule 5, V1 MCP tools are stateless — a
 * fresh instance and a fresh `actor` closure every call, never a shared
 * session). `McpServer.registerTool()` installs its own aggregated
 * `tools/list` handler the moment the first tool is registered, so no
 * manual `ListToolsRequestSchema` handler is needed here anymore (a
 * duplicate registration for the same method would throw).
 */
export function createMcpServerInstance(actor: ActorContext): McpServer {
  const mcp = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  registerReadTools(mcp, actor);
  registerWriteTools(mcp, actor);

  return mcp;
}
