/**
 * Walks a founder's whole path through the app and saves a screenshot of
 * every state, so the flow and its copy can be reviewed as a set rather
 * than page by page.
 *
 * Local development only. It signs in as the `@seed.test` fixtures created
 * by scripts/seed-test-founders.ts — run that first.
 *
 *   pnpm --filter web capture:onboarding
 *   pnpm --filter web capture:onboarding -- --out ../../screenshots
 *
 * Uses playwright-core against the Chrome already installed on this
 * machine rather than pulling down Playwright's own browser bundle.
 */
import fs from "node:fs/promises";
import path from "node:path";

import { chromium, type Browser, type Page } from "playwright-core";

const BASE_URL = process.env.CAPTURE_BASE_URL ?? "http://localhost:3000";
const PASSWORD = "TestFounder!2026";
const VIEWPORT = { width: 1440, height: 900 };

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

async function resolveBrowserPath(): Promise<string> {
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

interface Shot {
  /** File name, without extension. Numbered so the set reads in order. */
  name: string;
  /** Which seeded founder to be while taking it. */
  account: string;
  /** What a reviewer should be looking at. Printed in the summary. */
  looksAt: string;
  path: string;
  /** Runs after navigation, before the shot — opening a step, say. */
  prepare?: (page: Page) => Promise<void>;
  /**
   * Scroll this text into view first. Viewport-sized shots stop at the
   * fold, so anything below it needs its own frame — otherwise the parts
   * of a long page most likely to be wrong are the parts never reviewed.
   */
  scrollTo?: string;
}

/** Opens one of the numbered step tabs inside a module's card. */
function openModuleStep(label: string) {
  return async (page: Page) => {
    const step = page.locator("button", { hasText: label }).first();
    if (await step.count()) {
      await step.click();
      await page.waitForTimeout(600);
    }
  };
}

const SHOTS: Shot[] = [
  {
    name: "01-sign-in",
    account: "",
    path: "/",
    looksAt: "Sign-in page. Marketing copy and the cohort note.",
  },
  {
    name: "02-dashboard-first-visit",
    account: "new",
    path: "/dashboard",
    looksAt:
      'First visit: "Welcome <name>" with no sub-line, First card = Set up your profile, Start now + Skip for now. Below it the password prompt, which states the situation and the action without spelling out the threat model.',
  },
  {
    name: "03-profile",
    account: "new",
    path: "/profile",
    looksAt:
      "No subtitle, no About you field. AI assistant section below the form; password now lives on its own Account security page.",
  },
  {
    name: "03b-account-security",
    account: "new",
    path: "/account-security",
    looksAt:
      "Split out of Your profile. Kicker + heading match the sidebar label, then the same password form and inert reset-by-email note that used to sit at the bottom of the profile page.",
  },
  {
    name: "04-dashboard-after-profile",
    account: "named",
    path: "/dashboard",
    looksAt: "Name filled: card moves to Next = Connect Claude.",
  },
  {
    name: "04b-module1-locked",
    account: "named",
    path: "/modules/module-01-pressure-test",
    looksAt:
      'Not connected yet: module marked OPEN in the catalog, but the detail page gates it behind a "Connect Claude to start this module" card above the brief.',
  },
  {
    name: "04c-dashboard-password-changed",
    account: "secured",
    path: "/dashboard",
    looksAt:
      "Name filled and password already changed, still not connected: both prompt cards gone, only the Connect Claude banner remains.",
  },
  {
    name: "05-connection",
    account: "named",
    path: "/connection",
    looksAt:
      "Five steps with the address inside step 3, Optional tag on step 5, troubleshooting block with the lime rule, waiting watcher. Intro leads with what it costs and what happens next, not how the connection works.",
  },
  {
    name: "05b-connection-troubleshooting",
    account: "named",
    path: "/connection",
    looksAt:
      "Below the fold: the troubleshooting block (plan restrictions) and the waiting watcher.",
    scrollTo: "If something doesn't look right",
  },
  {
    name: "06-connection-claude-help",
    account: "named",
    path: "/connection",
    looksAt: 'The "Rather have Claude walk you through it?" disclosure, open.',
    prepare: async (page) => {
      await page.evaluate(() => {
        document.querySelectorAll("details").forEach((d) => (d.open = true));
      });
      await page.waitForTimeout(400);
    },
  },
  {
    name: "06b-connection-connected",
    account: "verdict",
    path: "/connection",
    looksAt:
      'The connected view: header reads "Your account / Claude connection" rather than telling someone already connected to connect, status rows read Connected to / Stays connected until / Claude last used it, then Disconnect with copy saying the connector stays in Claude. "Stays connected until" is the refresh token\'s expiry, ~30 days out, not the hourly access token.',
  },
  {
    name: "07-dashboard-connected",
    account: "connected",
    path: "/dashboard",
    looksAt: "Connected, no run: Next = Open your program.",
  },
  {
    name: "07b-dashboard-module1-open",
    account: "module1",
    path: "/dashboard",
    looksAt:
      'Returning-visitor greeting ("Welcome back, Barbara"), Next = Start Module 1 / Open Module 1.',
  },
  {
    name: "08-modules-list",
    account: "module1",
    path: "/modules",
    looksAt: "Six cards, no Module 0, count reads 1 of 6 open.",
  },
  {
    name: "09-module1-brief",
    account: "module1",
    path: "/modules/module-01-pressure-test",
    looksAt:
      "Step 1: what the module is for, why it matters, before you start.",
  },
  {
    name: "10-module1-work",
    account: "module1",
    path: "/modules/module-01-pressure-test",
    looksAt:
      "Step 2: strong-answer card, the prompt, Continue in Claude on the module accent, progress lines.",
    prepare: openModuleStep("Work through it"),
  },
  {
    name: "11-module1-confirm-empty",
    account: "module1",
    path: "/modules/module-01-pressure-test",
    looksAt: "Step 3 with nothing saved: outline of what the verdict covers.",
    prepare: openModuleStep("Confirm and unlock"),
  },
  {
    name: "12-module1-confirm-document",
    account: "verdict",
    path: "/modules/module-01-pressure-test",
    looksAt:
      "Step 3 with a saved verdict: the document rendered inline, collapsed, with Show the rest.",
    prepare: openModuleStep("Confirm and unlock"),
  },
  {
    name: "13-module1-confirm-expanded",
    account: "verdict",
    path: "/modules/module-01-pressure-test",
    looksAt: "Same step with the document expanded.",
    prepare: async (page) => {
      await openModuleStep("Confirm and unlock")(page);
      const toggle = page.locator("button", { hasText: "Show the rest" });
      if (await toggle.count()) {
        await toggle.first().click();
        await page.waitForTimeout(400);
      }
    },
  },
  {
    name: "13b-module1-confirm-button",
    account: "verdict",
    path: "/modules/module-01-pressure-test",
    looksAt:
      "Below the fold: your decision, the confirm button, and the revise hint.",
    prepare: openModuleStep("Confirm and unlock"),
    scrollTo: "Not happy with it",
  },
  {
    name: "13c-dashboard-module1-complete",
    account: "verdict",
    path: "/dashboard",
    looksAt:
      'Returning-visitor greeting ("Welcome back, Radia"), Next = Module 1 is complete / View artefacts.',
  },
  {
    name: "14-artefacts",
    account: "verdict",
    path: "/artefacts",
    looksAt: "One group, no Setup Summary, count reads 1 of 1 saved.",
  },
  {
    name: "15-artefact-document",
    account: "verdict",
    path: "/artefacts/module-01-pressure-test/pressure_test_verdict",
    looksAt: "Full artefact page with the rendered markdown.",
  },
  {
    name: "16-module1-stuck-setup",
    account: "stuck",
    path: "/modules/module-01-pressure-test",
    looksAt:
      'Migration case: "Finish setting up your workspace" instead of a dead-end lock notice.',
  },
  {
    name: "17-company-profile",
    account: "named",
    path: "/company-profile",
    looksAt: "No subtitle. Website field lives here, not on Your profile.",
  },
  {
    name: "18-workspace",
    account: "named",
    path: "/workspace",
    looksAt:
      'Not in the nav. "Your ideas", labelled status (no raw enums), Add an idea.',
  },
  {
    name: "19-module-not-found",
    account: "named",
    path: "/modules/module-99-nope",
    looksAt: "Not-found page on the app's own type scale.",
  },
];

async function signIn(page: Page, account: string): Promise<void> {
  // Through the real endpoint rather than the form: this is a capture
  // harness, and typing into the login form is not what it is testing.
  const response = await page.request.post(
    `${BASE_URL}/api/auth/sign-in/email`,
    { data: { email: `${account}@seed.test`, password: PASSWORD } },
  );
  if (!response.ok()) {
    throw new Error(
      `Sign-in failed for ${account}@seed.test (${response.status()}). Run seed:test-founders first.`,
    );
  }
}

async function signOut(page: Page): Promise<void> {
  await page.context().clearCookies();
}

async function capture(
  browser: Browser,
  shot: Shot,
  outDir: string,
): Promise<void> {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  try {
    if (shot.account) {
      await signIn(page, shot.account);
    } else {
      await signOut(page);
    }

    await page.goto(`${BASE_URL}${shot.path}`, { waitUntil: "networkidle" });
    // Suspense boundaries and the module step rail both settle a beat after
    // the network does.
    await page.waitForTimeout(900);
    if (shot.prepare) {
      await shot.prepare(page);
    }
    if (shot.scrollTo) {
      const target = page.getByText(shot.scrollTo, { exact: false }).first();
      if (await target.count()) {
        await target.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
      }
    }

    // Viewport-sized, not fullPage: a full-page capture of these pages
    // comes out as a very tall strip that is harder to judge a layout
    // from than the screen a founder actually sees.
    await page.screenshot({
      path: path.join(outDir, `${shot.name}.png`),
    });
  } finally {
    await context.close();
  }
}

async function main(): Promise<void> {
  const outFlag = process.argv.indexOf("--out");
  const outDir = path.resolve(
    outFlag === -1 ? "screenshots/onboarding" : process.argv[outFlag + 1],
  );
  await fs.mkdir(outDir, { recursive: true });

  const executablePath =
    process.env.CAPTURE_BROWSER_PATH ?? (await resolveBrowserPath());
  const browser = await chromium.launch({ executablePath, headless: true });

  const failures: string[] = [];
  try {
    for (const shot of SHOTS) {
      try {
        await capture(browser, shot, outDir);
        console.log(`  ${shot.name}.png`);
      } catch (error) {
        failures.push(`${shot.name}: ${(error as Error).message}`);
        console.error(`  ${shot.name} FAILED`);
      }
    }
  } finally {
    await browser.close();
  }

  const index = SHOTS.map((s) => `${s.name}.png\n  ${s.looksAt}`).join("\n\n");
  await fs.writeFile(path.join(outDir, "README.txt"), `${index}\n`, "utf8");

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
