import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { NextFunction, Request, Response } from "express";
import { logger } from "./logger.js";
import { createServer } from "./server.js";
import { ensureSeedData } from "./storage/seed.js";
import { registerWebRoutes } from "./web/routes.js";

const PORT = Number(process.env.PORT ?? 8787);

async function main(): Promise<void> {
  await ensureSeedData();

  // Bound to 0.0.0.0 so a tunnel (cloudflared) can reach it; DNS rebinding /
  // origin protection is intentionally off here - see README "Known
  // tradeoffs". This is a POC behind an anonymous, unpredictable tunnel
  // hostname with no mutating MCP tools, not a production deployment.
  const app = createMcpExpressApp({ host: "0.0.0.0" });

  // createMcpExpressApp() applies express.json() globally; a malformed
  // body would otherwise fall through to Express's default HTML error
  // page, which leaks a stack trace to the browser. Catch it here instead
  // so every response - /mcp included - is JSON, never HTML.
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof SyntaxError) {
      res.status(400).json({ error_code: "INVALID_JSON_BODY", message: "Request body is not valid JSON." });
      return;
    }
    next(err);
  });

  // Stateless Streamable HTTP: a brand new McpServer + transport is created
  // and torn down for every single POST request, never shared across
  // requests or reused from a prior connection. This matches the official
  // v1 stateless pattern - one long-lived shared transport would be a
  // stateful design wearing a stateless sessionIdGenerator.
  app.post("/mcp", async (req, res) => {
    try {
      const server = await createServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
    } catch (error) {
      logger.error("Unhandled error handling POST /mcp", { error: String(error) });
      if (!res.headersSent) {
        res.status(500).json({ error_code: "INTERNAL_ERROR", message: "Unexpected error handling MCP request." });
      }
    }
  });

  // This stateless, read-only server has no server-initiated notifications
  // (no SSE stream) and no session to delete - GET/DELETE have nothing
  // meaningful to do, so they're rejected rather than silently accepted.
  app.get("/mcp", (_req, res) => res.status(405).end());
  app.delete("/mcp", (_req, res) => res.status(405).end());

  registerWebRoutes(app);

  app.listen(PORT, () => {
    logger.info(`ai-catalyst-mcp-server-poc listening on http://0.0.0.0:${PORT} (POST /mcp, GET /poc).`);
  });
}

main().catch((error) => {
  logger.error("Fatal error starting HTTP server", { error: String(error) });
  process.exit(1);
});
