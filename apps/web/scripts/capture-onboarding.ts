/**
 * Walks a founder's whole path through the app and saves a screenshot of
 * every state, so the flow and its copy can be reviewed as a set rather
 * than page by page.
 *
 * Sign-in appears here once, in the state that is live today. The other
 * authentication methods are behind build-time flags and need the source
 * edited to be seen at all, which is scripts/capture-auth.ts's job.
 *
 * Local development only. It signs in as the `@seed.test` fixtures created
 * by scripts/seed-test-founders.ts — run that first.
 *
 *   pnpm --filter web capture:onboarding
 *   pnpm --filter web capture:onboarding -- --out ../../screenshots
 */
import fs from "node:fs/promises";
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
const PASSWORD = "TestFounder!2026";

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
    looksAt:
      "Sign-in page as it ships today: email and password only. scripts/capture-auth.ts has the same page with Google and the emailed code turned on.",
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
  // Modules 2-7 Brief + Work steps, on the `toolkit` account (Modules 1-6
  // confirmed with real saved artefacts, Module 7 open — see
  // scripts/seed-module-content.ts). Only these two steps: Confirm renders a
  // real generated document, which these fixtures don't produce (they save
  // artefact content directly rather than through a Claude conversation), so
  // Module 1's own 11-13c shots are still the only Confirm-step reference.
  {
    name: "20-module2-brief",
    account: "toolkit",
    path: "/modules/module-02-customer-avatar",
    looksAt:
      "Module 2 step 1: Create an Ideal Customer Profile — what it's for, why it matters.",
    // Already completed, so the page otherwise defaults to step 3.
    prepare: openModuleStep("What this is"),
  },
  {
    name: "21-module2-work",
    account: "toolkit",
    path: "/modules/module-02-customer-avatar",
    looksAt: "Module 2 step 2: the work-through prompt and progress lines.",
    prepare: openModuleStep("Work through it"),
  },
  {
    name: "22-module3-brief",
    account: "toolkit",
    path: "/modules/module-03-problem-statement",
    looksAt:
      "Module 3 step 1: Create a Problem Statement & Customer Discovery Guide — what it's for, why it matters.",
    prepare: openModuleStep("What this is"),
  },
  {
    name: "23-module3-work",
    account: "toolkit",
    path: "/modules/module-03-problem-statement",
    looksAt: "Module 3 step 2: the work-through prompt and progress lines.",
    prepare: openModuleStep("Work through it"),
  },
  {
    name: "24-module4-brief",
    account: "toolkit",
    path: "/modules/module-04-solution-statement",
    looksAt:
      "Module 4 step 1: Create a Solution — what it's for, why it matters.",
    prepare: openModuleStep("What this is"),
  },
  {
    name: "25-module4-work",
    account: "toolkit",
    path: "/modules/module-04-solution-statement",
    looksAt: "Module 4 step 2: the work-through prompt and progress lines.",
    prepare: openModuleStep("Work through it"),
  },
  {
    name: "26-module5-brief",
    account: "toolkit",
    path: "/modules/module-05-epics-user-stories",
    looksAt:
      "Module 5 step 1: Create Epics & User Stories — what it's for, why it matters.",
    prepare: openModuleStep("What this is"),
  },
  {
    name: "27-module5-work",
    account: "toolkit",
    path: "/modules/module-05-epics-user-stories",
    looksAt: "Module 5 step 2: the work-through prompt and progress lines.",
    prepare: openModuleStep("Work through it"),
  },
  {
    name: "28-module6-brief",
    account: "toolkit",
    path: "/modules/module-06-competitive-analysis",
    looksAt:
      "Module 6 step 1: Create a Competitor Analysis — what it's for, why it matters.",
    prepare: openModuleStep("What this is"),
  },
  {
    name: "29-module6-work",
    account: "toolkit",
    path: "/modules/module-06-competitive-analysis",
    looksAt: "Module 6 step 2: the work-through prompt and progress lines.",
    prepare: openModuleStep("Work through it"),
  },
  {
    name: "30-module7-brief",
    account: "toolkit",
    path: "/modules/module-07-business-model",
    looksAt:
      "Module 7 step 1: Create Business Model Options — the last module, unlocked by Module 6 but not itself completed by this fixture.",
  },
  {
    name: "31-module7-work",
    account: "toolkit",
    path: "/modules/module-07-business-model",
    looksAt: "Module 7 step 2: the work-through prompt and progress lines.",
    prepare: openModuleStep("Work through it"),
  },
  {
    name: "32-artefacts-all-modules",
    account: "toolkit",
    path: "/artefacts",
    looksAt:
      "Full artefacts list across Modules 1-6, ten documents in six groups, count reads 10 of 13 saved (Module 7's three not yet produced). Compare against 14-artefacts, the single-document version.",
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
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
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
  const outDir = resolveOutDir("screenshots/onboarding");
  await fs.mkdir(outDir, { recursive: true });

  const browser = await launchCaptureBrowser();

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
