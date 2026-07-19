// Verifies that `next build`'s standalone output (apps/web/next.config.ts
// sets `output: "standalone"`) actually packaged the Toolkit content that
// packages/services/module reads at runtime — a passing `pnpm build` alone
// does not prove that, since the full monorepo (including
// packages/toolkit-content) is still on disk during a local build, so a
// missing `outputFileTracingIncludes` entry would silently pass locally and
// only fail once actually deployed (where only the traced output exists).
//
// Two checks, both required:
//
// 1. Static: each route's `page.js.nft.json` / `route.js.nft.json` (Next's
//    Node File Trace manifest — the literal list of files that get copied
//    into `.next/standalone` for that route) must list
//    `packages/toolkit-content`'s manifest plus the specific
//    modules/*.md or skills/*/SKILL.md files it needs. This is what
//    `outputFileTracingIncludes` actually controls, so it catches a
//    misconfigured or removed include even if nothing else would.
// 2. Live: the traced `server.js` is started in place and the real routes
//    are requested, to catch runtime bugs (e.g. a bad path computation)
//    that a static file-list check can't.
//
// (Running the live check from an isolated copy of only `.next/standalone`
// would be a stronger version of check 2, but Node's `fs.cp` has to
// recreate pnpm's many symlinks, which needs elevated privileges/Developer
// Mode on Windows — so check 1 carries the "did we actually package the
// right files" burden here instead.)
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webDir = fileURLToPath(new URL("..", import.meta.url));
const nextDir = path.join(webDir, ".next");
const standaloneWebDir = path.join(nextDir, "standalone", "apps", "web");
const serverEntry = path.join(standaloneWebDir, "server.js");

const KNOWN_MODULE_ID = "module-00-setup";
const PORT = 4173;

function log(message) {
  console.log(`[verify-standalone-build] ${message}`);
}

function assertTraced(nftRelativePath, requiredSuffixes) {
  const nftPath = path.join(nextDir, "server", nftRelativePath);
  if (!existsSync(nftPath)) {
    throw new Error(`Expected a Node File Trace manifest at ${nftPath}.`);
  }

  const { files } = JSON.parse(readFileSync(nftPath, "utf8"));
  const missing = requiredSuffixes.filter(
    (suffix) =>
      !files.some((file) => file.replaceAll("\\", "/").endsWith(suffix)),
  );

  if (missing.length > 0) {
    throw new Error(
      `${nftRelativePath} is missing traced file(s): ${missing.join(", ")}.\n` +
        `Check apps/web/next.config.ts's outputFileTracingIncludes.`,
    );
  }

  log(
    `${nftRelativePath} traces all ${requiredSuffixes.length} required file(s).`,
  );
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

  assertTraced(path.join("app", "toolkit", "[module]", "page.js.nft.json"), [
    "packages/toolkit-content/manifest.json",
    `packages/toolkit-content/modules/${KNOWN_MODULE_ID}.md`,
  ]);
  assertTraced(path.join("app", "downloads", "[module]", "route.js.nft.json"), [
    "packages/toolkit-content/manifest.json",
    `packages/toolkit-content/skills/${KNOWN_MODULE_ID}/SKILL.md`,
  ]);

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
    await waitForServer(`${baseUrl}/toolkit`, 15_000, () => serverOutput);

    const checks = [
      { path: "/toolkit", expected: 200 },
      { path: `/toolkit/${KNOWN_MODULE_ID}`, expected: 200 },
      { path: `/downloads/${KNOWN_MODULE_ID}`, expected: 200 },
    ];

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
