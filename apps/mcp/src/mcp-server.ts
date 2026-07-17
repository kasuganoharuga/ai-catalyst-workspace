import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const SERVER_NAME = "ai-catalyst-mcp";
const SERVER_VERSION = "0.1.0";

/**
 * Builds a fresh `McpServer` instance for a single request.
 *
 * V1 skeleton: no tools/resources/prompts are registered yet, so `tools/list`
 * is wired manually via the low-level `Server` (`mcp.server`) to return an
 * empty list. Once real tools are added with `registerTool()`, remove this
 * manual handler — `McpServer` installs its own aggregated `tools/list`
 * handler the first time a tool is registered, and a duplicate registration
 * for the same method throws.
 */
export function createMcpServerInstance(): McpServer {
  const mcp = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  mcp.server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [],
  }));

  return mcp;
}
