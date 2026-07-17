import { startMcpServer } from "./server.js";

const DEFAULT_PORT = 8787;
const DEFAULT_ALLOWED_HOSTS = ["localhost", "127.0.0.1", "mcp"];
const DEFAULT_ALLOWED_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];

function parsePort(value: string | undefined): number {
  if (value === undefined || value.trim() === "") {
    return DEFAULT_PORT;
  }

  if (!/^\d+$/.test(value.trim())) {
    throw new Error(`Invalid MCP_PORT: "${value}". Must be a positive integer.`);
  }

  const parsed = Number(value.trim());
  if (parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid MCP_PORT: "${value}". Must be between 1 and 65535.`);
  }

  return parsed;
}

function parseAllowlist(value: string | undefined, fallback: string[]): string[] {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

const port = parsePort(process.env.MCP_PORT);
const allowedHosts = parseAllowlist(process.env.MCP_ALLOWED_HOSTS, DEFAULT_ALLOWED_HOSTS);
const allowedOrigins = parseAllowlist(process.env.MCP_ALLOWED_ORIGINS, DEFAULT_ALLOWED_ORIGINS);

const httpServer = startMcpServer({ port, allowedHosts, allowedOrigins });

function shutdown(signal: string): void {
  console.log(`Received ${signal}, shutting down MCP server...`);
  httpServer.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
