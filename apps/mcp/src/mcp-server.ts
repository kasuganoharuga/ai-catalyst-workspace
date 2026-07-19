import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { ActorContext } from "@ai-catalyst/contracts/actor-context";

import { registerReadTools } from "./tools/read-tools.js";
import { registerWriteTools } from "./tools/write-tools.js";

const SERVER_NAME = "ai-catalyst-mcp";
const SERVER_VERSION = "0.1.0";

/**
 * Builds a fresh McpServer per request with tools bound to the verified
 * actor. V1 MCP tools are stateless — no shared session.
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
