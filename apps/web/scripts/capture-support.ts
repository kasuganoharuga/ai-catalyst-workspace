/**
 * Shared plumbing for the two capture scripts: capture-onboarding.ts walks a
 * founder's path through the app, capture-auth.ts shoots the sign-in page in
 * each of its authentication-method combinations.
 *
 * Uses playwright-core against the Chrome already installed on this machine
 * rather than pulling down Playwright's own browser bundle.
 */
import fs from "node:fs/promises";
import path from "node:path";

import { chromium, type Browser } from "playwright-core";

/** A laptop screen, captured at 2x because the shots are read on a retina one. */
export const VIEWPORT = { width: 1440, height: 900 };
export const DEVICE_SCALE_FACTOR = 2;

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

export async function resolveBrowserPath(): Promise<string> {
  for (const candidate of CHROME_CANDIDATES) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next one.
    }
  }
  throw new Error(
    "No Chrome or Edge found. Set CAPTURE_BROWSER_PATH to a Chromium binary.",
  );
}

export async function launchCaptureBrowser(): Promise<Browser> {
  const executablePath =
    process.env.CAPTURE_BROWSER_PATH ?? (await resolveBrowserPath());
  return chromium.launch({ executablePath, headless: true });
}

/** `--out <dir>`, defaulting to `fallback`. Resolved against the cwd (apps/web). */
export function resolveOutDir(fallback: string): string {
  const flag = process.argv.indexOf("--out");
  if (flag === -1) {
    return path.resolve(fallback);
  }
  const value = process.argv[flag + 1];
  if (!value) {
    throw new Error("--out needs a directory.");
  }
  return path.resolve(value);
}

/**
 * The set's own contents page: what a reviewer should be looking at in each
 * shot, so the folder can be reviewed without this script open beside it.
 */
export async function writeIndex(
  outDir: string,
  shots: { name: string; looksAt: string }[],
): Promise<void> {
  const index = shots.map((s) => `${s.name}.png\n  ${s.looksAt}`).join("\n\n");
  await fs.writeFile(path.join(outDir, "README.txt"), `${index}\n`, "utf8");
}
