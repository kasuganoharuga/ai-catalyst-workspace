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
 * One stateless MCP POST: fresh server + transport per request, torn down on response close.
 * `req.actorContext` comes from verifyBearerToken; traceId correlates service calls and audit rows.
 */
async function handleStatelessMcpRequest(
  req: Request,
  res: Response,
): Promise<void> {
  const baseActor = req.actorContext;
  if (!baseActor) {
    // Invariant: real /mcp route always sets actorContext via verifyBearerToken.
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
    // V1 has no streaming tools — plain JSON is simpler for clients than SSE.
    enableJsonResponse: true,
  });

  // Attach before handleRequest — with enableJsonResponse the response may finish during await.
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
 * Express app for the MCP Resource Server: stateless `/mcp` plus `/health`.
 * Separate from startMcpServer so tests can run in-process without binding a port.
 */
export function createMcpApp(options: CreateMcpAppOptions): Express {
  const app = express();

  const protectedResourceMetadataUrl = new URL(
    "/.well-known/oauth-protected-resource",
    options.resourceUrl,
  ).toString();

  // Before host/origin checks — health and RFC 9728 metadata are unauthenticated probes.
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
