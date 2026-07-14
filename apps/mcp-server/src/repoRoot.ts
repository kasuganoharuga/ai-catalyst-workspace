import path from "node:path";
import { fileURLToPath } from "node:url";

const thisFileDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolves the monorepo root regardless of the working directory the
 * process was launched from (Inspector, Claude Desktop, and a plain
 * terminal can all differ). Priority:
 *   1. CLAUDE_PROJECT_DIR - set by Claude Code, not by Claude Desktop.
 *   2. AI_CATALYST_REPO_ROOT - set explicitly for Claude Desktop / manual runs.
 *   3. process.cwd() - last resort only.
 */
export function resolveRepositoryRoot(): string {
  return process.env.CLAUDE_PROJECT_DIR ?? process.env.AI_CATALYST_REPO_ROOT ?? process.cwd();
}

/** Absolute path to apps/mcp-server, derived from this file's own location (never cwd). */
export function resolveMcpServerRoot(): string {
  // dist/repoRoot.js -> apps/mcp-server ; src/repoRoot.ts (tsx) -> apps/mcp-server
  return path.resolve(thisFileDir, "..");
}

export function resolveManifestPath(): string {
  return path.join(resolveRepositoryRoot(), "packages", "toolkit-content", "manifest.json");
}

export function resolveDataDirectory(): string {
  return path.join(resolveMcpServerRoot(), "data");
}
