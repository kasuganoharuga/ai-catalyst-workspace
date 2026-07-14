import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "../src/logger.js";
import { resolveDataDirectory } from "../src/repoRoot.js";
import { ensureSeedData } from "../src/storage/seed.js";

function assertDataDirectoryShape(dataDirectory: string): void {
  const looksLikeDataDir = path.basename(dataDirectory) === "data";
  const looksLikeMcpServerParent = path.basename(path.dirname(dataDirectory)) === "mcp-server";
  if (!looksLikeDataDir || !looksLikeMcpServerParent) {
    throw new Error(`Refusing to reset unexpected data directory: ${dataDirectory}`);
  }
}

const dataDirectory = resolveDataDirectory();
assertDataDirectoryShape(dataDirectory);

await fs.rm(dataDirectory, { recursive: true, force: true });
logger.info(`Deleted ${dataDirectory}.`);

await ensureSeedData();
logger.info("Reset complete: clean demo-project-001 / module-01-pressure-test (in_progress) seeded.");
