import type { Server as HttpServer } from "node:http";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { hostHeaderValidation } from "@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js";
import express, { type Express, type Request, type Response } from "express";

import { createMcpServerInstance } from "./mcp-server.js";
import { originAllowlist } from "./middleware/origin-allowlist.js";

export interface CreateMcpAppOptions {
  /** Allowed `Host` header hostnames (port-agnostic), for DNS rebinding protection. */
  allowedHosts: string[];
  /** Allowed `Origin` header values, for browser cross-origin protection. */
  allowedOrigins: string[];
}

const METHOD_NOT_ALLOWED_BODY = {
  jsonrpc: "2.0",
  error: { code: -32000, message: "Method not allowed in stateless mode." },
  id: null,
} as const;

/**
 * Handles a single stateless MCP POST request: a fresh `McpServer` and
 * `StreamableHTTPServerTransport` are created per request (no session id,
 * no shared state across requests) and both are torn down once the
 * response closes, matching the SDK's stateless reference implementation.
 */
async function handleStatelessMcpRequest(req: Request, res: Response): Promise<void> {
  const mcp = createMcpServerInstance();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    // V1 has no long-running/streaming tools, so plain JSON responses are
    // simpler for both us and MCP clients than SSE. Revisit once a tool
    // needs to stream progress notifications.
    enableJsonResponse: true,
  });

  try {
    await mcp.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on("close", () => {
      void transport.close();
      void mcp.close();
    });
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error." },
        id: null,
      });
    }
    void transport.close();
    void mcp.close();
  }
}

function methodNotAllowed(_req: Request, res: Response): void {
  res.status(405).json(METHOD_NOT_ALLOWED_BODY);
}

/**
 * Builds the Express app for the MCP Resource Server: a single stateless
 * `/mcp` endpoint plus a `/health` check. Kept separate from `startMcpServer`
 * so tests can exercise the app in-process (via supertest) without binding a
 * port.
 */
export function createMcpApp(options: CreateMcpAppOptions): Express {
  const app = express();

  // Registered before the host/origin allowlists: health checks are probed
  // by infrastructure (Docker healthcheck, orchestrators) that may not send
  // the same Host/Origin headers a real MCP client would, and expose no
  // sensitive data, so they shouldn't depend on those checks passing.
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use(hostHeaderValidation(options.allowedHosts));
  app.use(originAllowlist(options.allowedOrigins));
  app.use(express.json({ limit: "1mb" }));

  app.post("/mcp", (req, res) => {
    void handleStatelessMcpRequest(req, res);
  });
  app.get("/mcp", methodNotAllowed);
  app.delete("/mcp", methodNotAllowed);

  return app;
}

export interface StartMcpServerOptions extends CreateMcpAppOptions {
  port: number;
}

/**
 * Starts the MCP HTTP server. Returns the underlying `http.Server` so the
 * caller (the process entrypoint) can drive graceful shutdown on signals.
 */
export function startMcpServer(options: StartMcpServerOptions): HttpServer {
  const app = createMcpApp(options);
  return app.listen(options.port, () => {
    console.log(`AI Catalyst MCP server listening on port ${options.port}`);
  });
}
