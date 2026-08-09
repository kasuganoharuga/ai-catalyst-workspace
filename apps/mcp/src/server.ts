import { randomUUID } from "node:crypto";
import type { Server as HttpServer } from "node:http";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { hostHeaderValidation } from "@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js";
import express, { type Express, type Request, type Response } from "express";

import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { loggerForService } from "@ai-catalyst/observability/logger";
import { SERVICE_NAMES } from "@ai-catalyst/observability/service-names";

import { verifyBearerToken } from "./auth/verify-bearer.js";
import { createMcpServerInstance } from "./mcp-server.js";
import { originAllowlist } from "./middleware/origin-allowlist.js";
import { buildProtectedResourceMetadata } from "./well-known/protected-resource.js";

const log = loggerForService(SERVICE_NAMES.mcp);

export interface CreateMcpAppOptions {
  /** Allowed `Host` header hostnames (port-agnostic), for DNS rebinding protection. */
  allowedHosts: string[];
  /** Allowed `Origin` header values, for browser cross-origin protection. */
  allowedOrigins: string[];
  /** This Resource Server's own canonical `/mcp` endpoint URL (RFC 9728 `resource`). */
  resourceUrl: string;
  /** apps/web's Authorization Server base URL. */
  authorizationServerUrl: string;
  /** Swappable for tests — see `VerifyBearerOptions.verify`. */
  verifyBearer?: (rawToken: unknown) => Promise<ActorContext>;
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
 *
 * `req.actorContext` is set by verifyBearerToken. A fresh traceId is added
 * here to correlate service calls and audit rows for this request.
 */
async function handleStatelessMcpRequest(
  req: Request,
  res: Response,
): Promise<void> {
  const baseActor = req.actorContext;
  if (!baseActor) {
    // Unreachable via the real `/mcp` route (verifyBearerToken never
    // calls next() without setting this) — an explicit invariant check
    // rather than a silent non-null assertion, in case a future route
    // ever reuses this handler without that middleware.
    res.status(500).json({
      jsonrpc: "2.0",
      error: { code: -32603, message: "Internal server error." },
      id: null,
    });
    return;
  }
  const correlationId = baseActor.traceId ?? randomUUID();
  const actor: ActorContext = {
    ...baseActor,
    traceId: correlationId,
    requestId: baseActor.requestId ?? correlationId,
  };
  const mcp = createMcpServerInstance(actor);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    // V1 has no long-running/streaming tools, so plain JSON responses are
    // simpler for both us and MCP clients than SSE. Revisit once a tool
    // needs to stream progress notifications.
    enableJsonResponse: true,
  });

  // Register before handleRequest: with enableJsonResponse the response often
  // finishes during that await, so a listener attached afterwards never fires.
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    void transport.close();
    void mcp.close();
  };
  res.on("close", cleanup);

  try {
    await mcp.connect(transport);
    await transport.handleRequest(req, res, req.body);
    // Belt-and-braces if `close` already fired before the listener attached
    // (should not happen now) or the runtime omits the event after end.
    if (res.writableEnded) {
      cleanup();
    }
  } catch (error) {
    log.error({
      event: "mcp_request_failed",
      message: "Error handling MCP request",
      trace_id: actor.traceId,
      request_id: actor.requestId,
      error_name: error instanceof Error ? error.name : "unknown",
    });
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error." },
        id: null,
      });
    }
    cleanup();
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

  const protectedResourceMetadataUrl = new URL(
    "/.well-known/oauth-protected-resource",
    options.resourceUrl,
  ).toString();

  // Registered before the host/origin allowlists: health checks and OAuth
  // discovery metadata are both probed by infrastructure/clients that may
  // not send the same Host/Origin headers a real MCP client would, and
  // expose no sensitive data, so neither should depend on those checks
  // passing. RFC 9728 requires this document be servable with no
  // authentication of its own.
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: SERVICE_NAMES.mcp });
  });
  app.get("/.well-known/oauth-protected-resource", (_req, res) => {
    res.json(
      buildProtectedResourceMetadata({
        resourceUrl: options.resourceUrl,
        authorizationServerUrl: options.authorizationServerUrl,
      }),
    );
  });

  app.use(hostHeaderValidation(options.allowedHosts));
  app.use(originAllowlist(options.allowedOrigins));
  app.use(express.json({ limit: "1mb" }));

  app.post(
    "/mcp",
    verifyBearerToken({
      protectedResourceMetadataUrl,
      verify: options.verifyBearer,
    }),
    (req, res) => {
      void handleStatelessMcpRequest(req, res);
    },
  );
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
    log.info({
      event: "mcp_server_listening",
      message: "AI Catalyst MCP server listening",
      port: options.port,
    });
  });
}
