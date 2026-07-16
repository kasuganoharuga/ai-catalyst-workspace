#!/usr/bin/env node
"use strict";

/**
 * Brings up the local backend stack in the order the app actually depends
 * on: start `db` and wait for it to be healthy, run pending migrations
 * against it from the host, seed the founder-toolkit content catalog,
 * then start (and build) every other service.
 *
 * This intentionally does not migrate/seed from inside a container: both
 * the migration runner and the content seed script are invoked the same
 * way in CI and locally, connecting over the published `5432` port rather
 * than the compose network.
 */

const { spawn } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..");
const composeFile = path.join(repoRoot, "infra", "docker", "docker-compose.yml");
const isWindows = process.platform === "win32";

const LOCAL_DATABASE_URL =
  "postgresql://ai_catalyst:ai_catalyst@127.0.0.1:5432/ai_catalyst";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      shell: isWindows,
      stdio: "inherit",
      ...options,
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
      }
    });

    child.on("error", reject);
  });
}

function dockerCompose(args) {
  return run("docker", ["compose", "-f", composeFile, ...args]);
}

async function main() {
  console.log("[docker-up] starting db...");
  await dockerCompose(["up", "-d", "--wait", "db"]);

  console.log("[docker-up] running migrations...");
  await run("pnpm", ["--filter", "@ai-catalyst/db", "run", "migrate"], {
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? LOCAL_DATABASE_URL },
  });

  console.log("[docker-up] seeding founder-toolkit content...");
  await run("pnpm", ["--filter", "@ai-catalyst/services", "run", "seed"], {
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? LOCAL_DATABASE_URL },
  });

  console.log("[docker-up] starting remaining services...");
  await dockerCompose(["up", "-d", "--build"]);

  console.log("[docker-up] done.");
}

main().catch((error) => {
  console.error(`[docker-up] ${error.message}`);
  process.exitCode = 1;
});
