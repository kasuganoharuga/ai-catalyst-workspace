/**
 * Stdio MCP transport reserves stdout for JSON-RPC framing. Never use
 * console.log anywhere in this project - always go through this logger,
 * which only ever writes to stderr (console.error).
 */
function timestamp(): string {
  return new Date().toISOString();
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>): void {
    console.error(`[${timestamp()}] [info] ${message}`, meta ?? "");
  },
  warn(message: string, meta?: Record<string, unknown>): void {
    console.error(`[${timestamp()}] [warn] ${message}`, meta ?? "");
  },
  error(message: string, meta?: Record<string, unknown>): void {
    console.error(`[${timestamp()}] [error] ${message}`, meta ?? "");
  },
};
