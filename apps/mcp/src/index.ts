import { loggerForService } from "@ai-catalyst/observability/logger";
import { SERVICE_NAMES } from "@ai-catalyst/observability/service-names";

import { initMcpSentry } from "./sentry.js";
import { startMcpServer } from "./server.js";

initMcpSentry();

const log = loggerForService(SERVICE_NAMES.mcp);

const DEFAULT_PORT = 8787;
const DEFAULT_ALLOWED_HOSTS = ["localhost", "127.0.0.1", "mcp"];
const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

function parsePort(value: string | undefined): number {
  if (value === undefined || value.trim() === "") {
    return DEFAULT_PORT;
  }

  if (!/^\d+$/.test(value.trim())) {
    throw new Error(
      `Invalid MCP_PORT: "${value}". Must be a positive integer.`,
    );
  }

  const parsed = Number(value.trim());
  if (parsed <= 0 || parsed > 65535) {
    throw new Error(
      `Invalid MCP_PORT: "${value}". Must be between 1 and 65535.`,
    );
  }

  return parsed;
}

function parseAllowlist(
  value: string | undefined,
  fallback: string[],
): string[] {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

const port = parsePort(process.env.MCP_PORT);
const allowedHosts = parseAllowlist(
  process.env.MCP_ALLOWED_HOSTS,
  DEFAULT_ALLOWED_HOSTS,
);
const allowedOrigins = parseAllowlist(
  process.env.MCP_ALLOWED_ORIGINS,
  DEFAULT_ALLOWED_ORIGINS,
);
// Public-facing URLs used only to build OAuth discovery metadata
// (RFC 9728) — never used to make an HTTP call between apps/mcp and
// apps/web; `verifyMcpBearerToken` (@ai-catalyst/services/mcp-auth) reads
// the platform token directly out of Postgres (DATABASE_URL below).
const resourceUrl = requireEnv("MCP_RESOURCE_URL");
const authorizationServerUrl = requireEnv("AUTH_ISSUER_URL");
requireEnv("DATABASE_URL");

const httpServer = startMcpServer({
  port,
  allowedHosts,
  allowedOrigins,
  resourceUrl,
  authorizationServerUrl,
});

function shutdown(signal: string): void {
  log.info({
    event: "mcp_server_shutdown",
    message: `Received ${signal}, shutting down MCP server`,
    signal,
  });
  httpServer.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
