import { logger } from "../src/logger.js";
import { ensureSeedData } from "../src/storage/seed.js";

await ensureSeedData();
logger.info("Seed complete: demo-project-001 / module-01-pressure-test ensured (non-destructive).");
