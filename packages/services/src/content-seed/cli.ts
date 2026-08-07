import { Pool } from "pg";

import { seedToolkitContent } from "./index.js";

function parseAllowArchive(argv: string[], env: NodeJS.ProcessEnv): boolean {
  return (
    argv.includes("--allow-archive") ||
    env.ALLOW_DESTRUCTIVE_CONTENT_CHANGE === "1"
  );
}

async function run(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const allowArchive = parseAllowArchive(process.argv.slice(2), process.env);

  // Deliberately a standalone pool, not the shared singleton: this CLI is
  // short-lived and must call pool.end() on exit, which would be the wrong
  // lifecycle for a hot-reload-cached pool that long-running consumers
  // rely on.
  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  try {
    await client.query("begin");
    const result = await seedToolkitContent(client, undefined, {
      allowArchive,
    });
    await client.query("commit");

    if (result.published) {
      console.log(
        `Published program_version ${result.programVersionId} ` +
          `(${result.modulesReconciled} modules, ${result.promptsReconciled} prompt versions).`,
      );
    } else if (
      result.modulesActivated > 0 ||
      result.promptVersionsActivated > 0
    ) {
      console.log(
        `program_version ${result.programVersionId} (content_lock=${result.contentLock}) reconciled in place: ` +
          `${result.modulesActivated} module(s) newly activated, ` +
          `${result.promptVersionsActivated} prompt version(s) newly published.`,
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
