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
const { existsSync } = require("node:fs");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..");
const composeFile = path.join(repoRoot, "infra", "docker", "docker-compose.yml");
const envFile = path.join(repoRoot, ".env");
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
  // `docker compose -f infra/docker/docker-compose.yml` defaults its env
  // file lookup to the compose file's own directory, not the repo root —
  // `--env-file` overrides just that lookup. (Deliberately not passing
  // `--project-directory`: that flag *also* changes what relative paths
  // like `context: ../..` resolve against, from "relative to the compose
  // file" to "relative to the project directory" — pointing it at the repo
  // root would turn `../..` into two levels above the repo root instead.)
  return run("docker", ["compose", "--env-file", envFile, "-f", composeFile, ...args]);
}

async function main() {
  if (!existsSync(envFile)) {
    throw new Error(
      `Missing ${envFile}. Copy .env.example to .env and fill in BETTER_AUTH_SECRET ` +
        "(the web service Docker Compose brings up needs it) before running docker:up.",
    );
  }

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
