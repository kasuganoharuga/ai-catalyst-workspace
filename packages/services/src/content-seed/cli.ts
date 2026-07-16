import { Pool } from "pg";

import { seedToolkitContent } from "./index.js";

async function run(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  // Deliberately a standalone pool, not the shared singleton: this CLI is
  // short-lived and must call pool.end() on exit, which would be the wrong
  // lifecycle for a hot-reload-cached pool that long-running consumers
  // rely on.
  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  try {
    await client.query("begin");
    const result = await seedToolkitContent(client);
    await client.query("commit");

    if (result.published) {
      console.log(
        `Published program_version ${result.programVersionId} ` +
          `(${result.modulesReconciled} modules, ${result.promptsReconciled} prompt versions).`,
      );
    } else {
      console.log(
        `program_version ${result.programVersionId} is already ${result.programVersionStatus}; ` +
          "content matched the seed constants, no changes made.",
      );
    }
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
