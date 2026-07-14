import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { logger } from "./logger.js";
import { createServer } from "./server.js";
import { ensureSeedData } from "./storage/seed.js";

/**
 * Kept for quick local Inspector smoke tests of the 4 read-only tools
 * without needing a tunnel. The real remote-access path is src/http.ts.
 */
async function main(): Promise<void> {
  await ensureSeedData();
  const server = await createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("ai-catalyst-mcp-server-poc connected over stdio.");
}

main().catch((error) => {
  logger.error("Fatal error starting MCP server", { error: String(error) });
  process.exit(1);
});
