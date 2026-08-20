// Verifies that `next build`'s standalone output (apps/web/next.config.ts
// sets `output: "standalone"`) actually boots and serves. A passing
// `pnpm build` does not prove that: the full monorepo is still on disk
// during a local build, so a workspace package that failed to trace into
// `.next/standalone` would pass locally and only fail once deployed, where
// only the traced output exists.
//
// The traced `server.js` is started in place and a real route is requested,
// which catches both a missing traced dependency and a runtime bug a static
// file-list check could not see.
//
// This script previously also asserted that packages/toolkit-content's
// manifest and SKILL.md files appeared in a route's Node File Trace
// manifest. That check is gone with /downloads: no route reads
// packages/toolkit-content off disk at request time any more, so there is
// no outputFileTracingIncludes entry left to protect. If a runtime route
// ever reads workspace files off disk again, restore the static check —
// `outputFileTracingIncludes` is exactly what it was there to guard.
//
// (Running the live check from an isolated copy of only `.next/standalone`
// would be stronger, but Node's `fs.cp` has to recreate pnpm's many
// symlinks, which needs elevated privileges/Developer Mode on Windows.)
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webDir = fileURLToPath(new URL("..", import.meta.url));
const nextDir = path.join(webDir, ".next");
const standaloneWebDir = path.join(nextDir, "standalone", "apps", "web");
const serverEntry = path.join(standaloneWebDir, "server.js");

const PORT = 4173;

function log(message) {
  console.log(`[verify-standalone-build] ${message}`);
}

async function fetchStatus(url) {
  const response = await fetch(url);
  await response.text();
  return response.status;
}

async function waitForServer(url, timeoutMs, getServerOutput) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetchStatus(url);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(
    `Server did not become ready within ${timeoutMs}ms.\n\nServer output:\n${getServerOutput()}`,
  );
}

async function main() {
  if (!existsSync(serverEntry)) {
    throw new Error(
      `Standalone server entry not found at ${serverEntry}. Run \`pnpm build\` first.`,
    );
  }

  log(`Starting standalone server on port ${PORT}...`);
  const server = spawn(process.execPath, [serverEntry], {
    cwd: standaloneWebDir,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let serverOutput = "";
  server.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });

  const baseUrl = `http://127.0.0.1:${PORT}`;

  try {
    await waitForServer(`${baseUrl}/`, 15_000, () => serverOutput);

    // Public, unauthenticated, and rendered by the app shell — enough to
    // prove the standalone bundle resolved its workspace dependencies.
    const checks = [{ path: "/", expected: 200 }];

    for (const check of checks) {
      const status = await fetchStatus(`${baseUrl}${check.path}`);
      if (status !== check.expected) {
        throw new Error(
          `GET ${check.path} returned ${status}, expected ${check.expected}.\n\nServer output:\n${serverOutput}`,
        );
      }
      log(`GET ${check.path} -> ${status}`);
    }

    log("All standalone build checks passed.");
  } finally {
    server.kill();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
