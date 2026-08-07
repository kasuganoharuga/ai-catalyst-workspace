#!/usr/bin/env node
"use strict";

/**
 * Runs the local dev stack the way a developer actually iterates: Postgres
 * in Docker, packages/db's migration runner against it, then web (Next.js)
 * and api (FastAPI) as local processes with fast reload — and guarantees
 * `docker compose down` runs on shutdown.
 *
 * This intentionally starts only the `db` container, not the full compose
 * stack: `pnpm docker:up` (scripts/docker-up.js) is the separate script that
 * brings up api as a built container too. Running both scripts' full stacks
 * at once would double-start api on the same port.
 *
 * This also intentionally avoids `concurrently`: on Windows, concurrently
 * kills child processes via the `tree-kill` package, which always runs
 * `taskkill /T /F` regardless of the requested signal. That force-kills
 * child CLIs without ever letting them (or Docker) run a graceful stop,
 * leaving containers running after Ctrl+C. Running everything as a direct
 * child of this script's own process lets us react to signals ourselves and
 * always invoke `docker compose down` explicitly.
 */

const { spawn } = require("node:child_process");
const readline = require("node:readline");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..");
const composeFile = path.join(
  repoRoot,
  "infra",
  "docker",
  "docker-compose.yml",
);
const apiDir = path.join(repoRoot, "apps", "api");
const isWindows = process.platform === "win32";

const LOCAL_DATABASE_URL =
  "postgresql://ai_catalyst:ai_catalyst@127.0.0.1:5432/ai_catalyst";

function spawnLabeled(label, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    shell: isWindows,
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });

  const prefix = `[${label}] `;
  const interfaces = [child.stdout, child.stderr].map((stream) => {
    const rl = readline.createInterface({ input: stream });
    rl.on("line", (line) => {
      process.stdout.write(prefix + line + "\n");
    });
    return rl;
  });

  // Don't rely solely on the streams' own "end" event: a killed child
  // (especially via a shell wrapper on Windows, where killing the shell
  // doesn't reliably kill its process tree) may never close its stdio
  // pipes. The child's own "exit" fires once the process itself has
  // terminated, so use it to deterministically close these interfaces.
  child.once("exit", () => {
    for (const rl of interfaces) rl.close();
  });

  return child;
}

function dockerCompose(args) {
  return spawnLabeled("docker", "docker", [
    "compose",
    "-f",
    composeFile,
    ...args,
  ]);
}

// Promise-based, for the one-shot setup steps (start db, migrate) that must
// finish — and be visibly logged — before web/api start.
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
        reject(
          new Error(`${command} ${args.join(" ")} exited with code ${code}`),
        );
      }
    });

    child.on("error", reject);
  });
}

async function main() {
  console.log("[dev] starting db...");
  await run("docker", [
    "compose",
    "-f",
    composeFile,
    "up",
    "-d",
    "--wait",
    "db",
  ]);

  console.log("[dev] running migrations...");
  // Same migration runner and invocation as scripts/docker-up.js and CI —
  // packages/db/src/migrate.ts is the only place schema changes happen.
  await run("pnpm", ["--filter", "@ai-catalyst/db", "run", "migrate"], {
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL ?? LOCAL_DATABASE_URL,
    },
  });

  console.log("[dev] starting web + api...");
  const web = spawnLabeled("web", "pnpm", ["--filter", "web", "dev"]);
  const api = spawnLabeled(
    "api",
    "python",
    [
      "-m",
      "uvicorn",
      "app.main:app",
      "--reload",
      "--host",
      "0.0.0.0",
      "--port",
      "8000",
    ],
    { cwd: apiDir },
  );

  let shuttingDown = false;

  function shutdown(exitCode) {
    if (shuttingDown) return;
    shuttingDown = true;

    process.stdout.write("\n[dev] stopping web + api + docker...\n");

    for (const child of [web, api]) {
      if (child.exitCode === null && !child.killed) {
        child.kill();
      }
    }

    const down = dockerCompose(["down"]);
    down.on("exit", () => process.exit(exitCode ?? 0));
    down.on("error", () => process.exit(exitCode ?? 1));
  }

  web.on("exit", (code) => shutdown(code));
  web.on("error", (err) => {
    process.stderr.write(`[dev] failed to start web: ${err.message}\n`);
    shutdown(1);
  });

  api.on("exit", (code) => shutdown(code));
  api.on("error", (err) => {
    process.stderr.write(`[dev] failed to start api: ${err.message}\n`);
    shutdown(1);
  });

  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));
}

main().catch((error) => {
  console.error(`[dev] ${error.message}`);
  process.exitCode = 1;
});
