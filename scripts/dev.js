#!/usr/bin/env node
"use strict";

/**
 * Runs the web dev server and the Docker backend together, and guarantees
 * `docker compose down` runs on shutdown.
 *
 * This intentionally avoids `concurrently`: on Windows, concurrently kills
 * child processes via the `tree-kill` package, which always runs
 * `taskkill /T /F` regardless of the requested signal. That force-kills the
 * `docker compose up` CLI without ever letting it (or Docker) run a graceful
 * stop, leaving the api/db containers running after Ctrl+C. Running compose
 * as a direct child of this script's own process lets us react to signals
 * ourselves and always invoke `docker compose down` explicitly.
 */

const { spawn } = require("node:child_process");
const readline = require("node:readline");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..");
const composeFile = path.join(repoRoot, "infra", "docker", "docker-compose.yml");
const isWindows = process.platform === "win32";

function spawnLabeled(label, command, args) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    shell: isWindows,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const prefix = `[${label}] `;
  for (const stream of [child.stdout, child.stderr]) {
    readline.createInterface({ input: stream }).on("line", (line) => {
      process.stdout.write(prefix + line + "\n");
    });
  }

  return child;
}

function dockerCompose(args) {
  return spawnLabeled("docker", "docker", ["compose", "-f", composeFile, ...args]);
}

const web = spawnLabeled("web", "pnpm", ["--filter", "web", "dev"]);
const docker = dockerCompose(["up", "--build"]);

let shuttingDown = false;

function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;

  process.stdout.write("\n[dev] stopping web + docker...\n");

  if (web.exitCode === null && !web.killed) {
    web.kill();
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

docker.on("exit", (code) => shutdown(code));
docker.on("error", (err) => {
  process.stderr.write(`[dev] failed to start docker: ${err.message}\n`);
  shutdown(1);
});

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
