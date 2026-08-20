/**
 * Shoots the sign-in page in every combination of authentication methods, so
 * the staged rollout of Google and emailed codes can be reviewed as a set
 * before either flag is flipped for real.
 *
 * The two methods are gated by build-time constants in lib/feature-flags.ts
 * (AUTH_GOOGLE_ENABLED, AUTH_EMAIL_OTP_ENABLED), both false on `develop`.
 * There is no runtime switch to flip — being constants is the point of them,
 * it is what lets the bundler drop the dead branches — so the only way to see
 * those states is to write the flags on, let `next dev` recompile, shoot, and
 * put the file back. This script does exactly that: lib/feature-flags.ts is
 * restored before it exits, on failure and on Ctrl+C as well as on success,
 * and if the restore itself ever fails it prints the path of the backup copy
 * it kept.
 *
 * Local development only, and specifically against `next dev`: a production
 * build never recompiles, so the flag edits would not show up and the run
 * exits rather than shooting pages that contradict their own file names.
 *
 * Before running it:
 *   - `pnpm --filter web seed:test-founders`, so the code flow has an address.
 *   - start the dev server with placeholder Google credentials:
 *       GOOGLE_CLIENT_ID=capture-only GOOGLE_CLIENT_SECRET=capture-only \
 *         pnpm --filter web dev
 *     lib/auth.ts calls requireEnv for both the moment AUTH_GOOGLE_ENABLED is
 *     true, and the server would fail to boot without them. Nothing here talks
 *     to Google: the button is photographed, never clicked.
 *   - leave EMAIL_PROVIDER unset (or `noop`), so the emailed code is discarded
 *     and printed to the dev server console instead of being sent.
 *
 *   pnpm --filter web capture:auth
 *   pnpm --filter web capture:auth -- --out ../../local/screenshots/auth
 */
import { writeFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { Browser, Page } from "playwright-core";

import {
  DEVICE_SCALE_FACTOR,
  launchCaptureBrowser,
  resolveOutDir,
  VIEWPORT,
  writeIndex,
} from "./capture-support";

const BASE_URL = process.env.CAPTURE_BASE_URL ?? "http://localhost:3000";
const FLAGS_FILE = path.resolve("lib/feature-flags.ts");
/** A seeded founder (scripts/seed-test-founders.ts) rather than a made-up address. */
const CODE_EMAIL = "named@seed.test";
/** A cold `next dev` compile of the sign-in route can take a while on Windows. */
const RECOMPILE_TIMEOUT_MS = 90_000;

interface FlagState {
  google: boolean;
  otp: boolean;
}

const FLAG_DECLARATIONS = [
  { key: "google", name: "AUTH_GOOGLE_ENABLED" },
  { key: "otp", name: "AUTH_EMAIL_OTP_ENABLED" },
] as const;

const GOOGLE_BUTTON = "Continue with Google";
const CODE_BUTTON = "Email me a sign-in code";

interface Shot {
  /** File name, without extension. Numbered so the set reads in order. */
  name: string;
  /** What a reviewer should be looking at. Printed in the summary. */
  looksAt: string;
  /** Runs after navigation, before the shot — sending a code, say. */
  prepare?: (page: Page) => Promise<void>;
}

interface Combo {
  flags: FlagState;
  shots: Shot[];
}

/** Fills the email field and asks for a code, leaving the page on code entry. */
async function sendCode(page: Page): Promise<void> {
  await page.getByPlaceholder("you@company.com").fill(CODE_EMAIL);
  await page.getByRole("button", { name: CODE_BUTTON }).click();
  await page
    .getByText("We sent a six-digit code", { exact: false })
    .waitFor({ timeout: 15_000 });
  await page.waitForTimeout(400);
}

/**
 * Grouped by flag combination, not one entry per shot: each group costs one
 * file write and one `next dev` recompile, so shots that share a combination
 * share the wait. Flags-off comes first, as the baseline the other three are
 * read against.
 */
const COMBOS: Combo[] = [
  {
    flags: { google: false, otp: false },
    shots: [
      {
        name: "01-password-only",
        looksAt:
          "Both flags off — what is live today, and the state the other shots are read against. Email, password, Continue to workspace, no divider anywhere.",
      },
    ],
  },
  {
    flags: { google: true, otp: false },
    shots: [
      {
        name: "02-google-only",
        looksAt:
          "Google alone. Outline button on top, one OR rule, then the password form still carrying its own email field. Google can ship before the code flow — it needs no email infrastructure — so this combination is a real deployment, not just a step in this script.",
      },
    ],
  },
  {
    flags: { google: false, otp: true },
    shots: [
      {
        name: "03-code-only",
        looksAt:
          "Emailed code alone. One email field, owned by the code form; the password form below it is reduced to the password field and shares that email. Two inputs for the same address would be the failure to look for here.",
      },
    ],
  },
  {
    flags: { google: true, otp: true },
    shots: [
      {
        name: "04-google-and-code",
        looksAt:
          "All three methods, the end state of the rollout: Google, OR, email + Email me a sign-in code, OR, password + Continue to workspace. Check that the two rules read as separators rather than as three unrelated cards.",
      },
      {
        name: "05-code-sent",
        looksAt:
          "After sending: the whole form is replaced by code entry, so there is only one submit button on the page. The address is echoed back, the five-minute expiry is stated, and Use a different email is the way back. The code itself goes to the dev server console (EMAIL_PROVIDER=noop discards the mail).",
        prepare: sendCode,
      },
      {
        name: "06-code-rejected",
        looksAt:
          "A wrong code: the error sits above the button, the entered code stays put, and the page does not throw the founder back to the email step.",
        prepare: async (page) => {
          await sendCode(page);
          await page.getByLabel("Sign-in code").fill("000000");
          await page
            .getByRole("button", { name: /Continue to workspace/ })
            .click();
          await page.getByRole("alert").waitFor({ timeout: 15_000 });
          await page.waitForTimeout(400);
        },
      },
    ],
  },
];

/** The same source with both flag declarations rewritten to `state`. */
function withFlags(source: string, state: FlagState): string {
  let next = source;
  for (const declaration of FLAG_DECLARATIONS) {
    const pattern = new RegExp(
      `export const ${declaration.name} = (?:true|false);`,
      "g",
    );
    const matches = next.match(pattern) ?? [];
    if (matches.length !== 1) {
      throw new Error(
        `Expected exactly one \`export const ${declaration.name} = <boolean>;\` in ${FLAGS_FILE}, found ${matches.length}. ` +
          "The flag was renamed, or its value is now computed — this script rewrites that line literally and will not guess.",
      );
    }
    next = next.replace(
      pattern,
      `export const ${declaration.name} = ${state[declaration.key]};`,
    );
  }
  return next;
}

function describe(state: FlagState): string {
  return `google=${state.google} otp=${state.otp}`;
}

/**
 * Reloads until the page agrees with the flags now on disk.
 *
 * The two buttons are the only reliable signal that the recompile landed:
 * `next dev` answers the request that triggers the rebuild, so the first
 * response after a write is routinely still the previous build.
 */
async function waitForFlags(page: Page, state: FlagState): Promise<void> {
  const deadline = Date.now() + RECOMPILE_TIMEOUT_MS;
  let sawServerError = false;
  let lastSeen = "nothing yet";

  while (Date.now() < deadline) {
    const response = await page.goto(BASE_URL, { waitUntil: "networkidle" });
    if (response && response.status() >= 500) {
      // Either a compile still in flight or a boot failure. Only the second
      // survives to the timeout, so it is judged there rather than here.
      sawServerError = true;
      lastSeen = `HTTP ${response.status()}`;
    } else {
      const google = await page
        .getByRole("button", { name: GOOGLE_BUTTON })
        .count();
      const code = await page
        .getByRole("button", { name: CODE_BUTTON })
        .count();
      if (google > 0 === state.google && code > 0 === state.otp) {
        // The form settles a beat after the network does.
        await page.waitForTimeout(600);
        return;
      }
      lastSeen = `google=${google > 0} otp=${code > 0}`;
    }
    await page.waitForTimeout(1_500);
  }

  throw new Error(
    `Sign-in page never matched ${describe(state)} within ${RECOMPILE_TIMEOUT_MS / 1_000}s (last saw ${lastSeen}). ` +
      (sawServerError
        ? "The server errored with the flags on. The usual cause is a dev server started without GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET, which lib/auth.ts requires as soon as AUTH_GOOGLE_ENABLED is true — check its log."
        : `Is ${BASE_URL} a \`next dev\` server? A production build does not pick up the edit to lib/feature-flags.ts.`),
  );
}

async function capture(
  browser: Browser,
  shot: Shot,
  state: FlagState,
  outDir: string,
): Promise<void> {
  // A context per shot: the code flow leaves the page mid-sign-in, and the
  // next shot has to start from one nobody has touched.
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
  });
  const page = await context.newPage();

  try {
    await waitForFlags(page, state);
    if (shot.prepare) {
      await shot.prepare(page);
    }
    // Viewport-sized, not fullPage, matching capture-onboarding.ts: the point
    // is the screen someone signing in actually sees.
    await page.screenshot({ path: path.join(outDir, `${shot.name}.png`) });
  } finally {
    await context.close();
  }
}

async function main(): Promise<void> {
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE_URL)) {
    throw new Error(
      `Refusing to run against ${BASE_URL}. This script edits lib/feature-flags.ts and depends on a local dev server recompiling it.`,
    );
  }

  const outDir = resolveOutDir("screenshots/auth");
  await fs.mkdir(outDir, { recursive: true });

  const original = await fs.readFile(FLAGS_FILE, "utf8");
  // Validated before the first write, so a renamed flag fails the run while
  // the file on disk is still untouched.
  withFlags(original, { google: true, otp: true });

  const backup = path.join(os.tmpdir(), "feature-flags.capture-backup.ts");
  await fs.writeFile(backup, original, "utf8");

  // Ctrl+C is the likeliest way this run ends early, and flags left written on
  // is the one outcome that could be committed by accident.
  const restoreOnSignal = () => {
    writeFileSync(FLAGS_FILE, original, "utf8");
    console.error("\nInterrupted. lib/feature-flags.ts restored.");
    process.exit(130);
  };
  process.on("SIGINT", restoreOnSignal);
  process.on("SIGTERM", restoreOnSignal);

  const browser = await launchCaptureBrowser();
  const failures: string[] = [];

  try {
    for (const combo of COMBOS) {
      await fs.writeFile(FLAGS_FILE, withFlags(original, combo.flags), "utf8");
      console.log(describe(combo.flags));
      for (const shot of combo.shots) {
        try {
          await capture(browser, shot, combo.flags, outDir);
          console.log(`  ${shot.name}.png`);
        } catch (error) {
          failures.push(`${shot.name}: ${(error as Error).message}`);
          console.error(`  ${shot.name} FAILED`);
        }
      }
    }
  } finally {
    await browser.close();
    await fs.writeFile(FLAGS_FILE, original, "utf8");
    const restored = await fs.readFile(FLAGS_FILE, "utf8");
    if (restored === original) {
      await fs.rm(backup, { force: true });
    } else {
      console.error(
        `\nlib/feature-flags.ts did NOT restore cleanly. The original is at ${backup} — put it back before committing.`,
      );
      process.exitCode = 1;
    }
  }

  await writeIndex(
    outDir,
    COMBOS.flatMap((combo) => combo.shots),
  );

  console.log(`\nSaved to ${outDir}`);
  if (failures.length > 0) {
    console.error(`\n${failures.length} failed:`);
    for (const failure of failures) console.error(`  ${failure}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
