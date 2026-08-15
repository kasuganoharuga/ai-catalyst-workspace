/**
 * One-off dev script: seeds a real, loggable-in Founder account with
 * Module 1 and Module 2 both fully completed, so the Module 2 "Ideal
 * Customer Avatar" PDF export can be tested end to end in the browser.
 *
 * The Module 2 content deliberately includes characters the embedded PDF
 * font previously had no glyph for (an arrow, checkmarks, a Polish
 * stroked-L name) inside "Founder assumptions" — the exact field
 * (`validation_status.3`) the original WORKBOOK_RENDER_FAILED bug report
 * named — so downloading the PDF is a real regression check for the
 * sanitizeForFontCoverage fix, not just a happy-path click-through.
 *
 * Local development only — same guard and same throwaway-password pattern
 * as scripts/seed-test-founders.ts, which this borrows its shape from.
 *
 *   pnpm --filter web exec tsx scripts/seed-module2-pdf-test.ts
 *   pnpm --filter web exec tsx scripts/seed-module2-pdf-test.ts --clean
 */
import path from "node:path";

import { config as loadEnv } from "dotenv";

import type { ActorContext } from "@ai-catalyst/contracts/actor-context";

loadEnv({ path: path.resolve(__dirname, "../.env.local") });

const EMAIL = "module2-pdf-test@seed.test";
const PASSWORD = "TestFounder!2026";
const MODULE_1_KEY = "module-01-pressure-test";
const MODULE_2_KEY = "module-02-customer-avatar";
const VERDICT_ARTIFACT_KEY = "pressure_test_verdict";
const AVATAR_ARTIFACT_KEY = "ideal_customer_avatar";

type Deps = {
  pool: typeof import("@ai-catalyst/db").pool;
  auth: typeof import("../lib/auth").auth;
  getOrCreateProgramRun: typeof import("@ai-catalyst/services/workflow").getOrCreateProgramRun;
  autoCompleteSetupModule: typeof import("@ai-catalyst/services/module/auto-setup").autoCompleteSetupModule;
  setActiveVenture: typeof import("@ai-catalyst/services/workspace/active-context").setActiveVenture;
  startOrResumeAttempt: typeof import("@ai-catalyst/services/attempt").startOrResumeAttempt;
  saveFounderResponse: typeof import("@ai-catalyst/services/attempt").saveFounderResponse;
  saveArtifactSubmission: typeof import("@ai-catalyst/services/artifact").saveArtifactSubmission;
  completeModuleAttempt: typeof import("@ai-catalyst/services/module/completion").completeModuleAttempt;
  confirmModuleCompletion: typeof import("@ai-catalyst/services/module/completion").confirmModuleCompletion;
};

async function loadDeps(): Promise<Deps> {
  const [
    db,
    authModule,
    workflow,
    autoSetup,
    activeContext,
    attempt,
    artifact,
    completion,
  ] = await Promise.all([
    import("@ai-catalyst/db"),
    import("../lib/auth"),
    import("@ai-catalyst/services/workflow"),
    import("@ai-catalyst/services/module/auto-setup"),
    import("@ai-catalyst/services/workspace/active-context"),
    import("@ai-catalyst/services/attempt"),
    import("@ai-catalyst/services/artifact"),
    import("@ai-catalyst/services/module/completion"),
  ]);
  return {
    pool: db.pool,
    auth: authModule.auth,
    getOrCreateProgramRun: workflow.getOrCreateProgramRun,
    autoCompleteSetupModule: autoSetup.autoCompleteSetupModule,
    setActiveVenture: activeContext.setActiveVenture,
    startOrResumeAttempt: attempt.startOrResumeAttempt,
    saveFounderResponse: attempt.saveFounderResponse,
    saveArtifactSubmission: artifact.saveArtifactSubmission,
    completeModuleAttempt: completion.completeModuleAttempt,
    confirmModuleCompletion: completion.confirmModuleCompletion,
  };
}

function assertLocalDatabase(): void {
  const url = process.env.DATABASE_URL ?? "";
  const isLocal =
    url.includes("@localhost") ||
    url.includes("@127.0.0.1") ||
    url.includes("@db:");
  if (!isLocal) {
    throw new Error(
      `Refusing to seed a test account: DATABASE_URL does not look local (${url.replace(/:[^:@]+@/, ":***@")}).`,
    );
  }
}

function founderActor(userId: string): ActorContext {
  return { userId, role: "founder", source: "web" };
}

const VERDICT_RESPONSES: { questionKey: string; answerText: string }[] = [
  {
    questionKey: "idea_one_sentence",
    answerText:
      "AI-driven automation of repetitive client and admin workflows for small professional service firms, without needing technical staff to build or maintain it.",
  },
  {
    questionKey: "target_customer",
    answerText:
      "Small professional service firms — accounting and advisory — where an ops-minded person is stuck manually moving information between email, docs, spreadsheets and internal tools.",
  },
  {
    questionKey: "customer_problem",
    answerText:
      "Manual movement of client information slows the team, creates inconsistent processes, and causes missed or mis-entered information. As the firm grows, they add admin headcount instead of scaling.",
  },
  {
    questionKey: "business_model",
    answerText:
      "B2B SaaS, AUD $199-499/month per company, scaling by users and workflows.",
  },
  { questionKey: "current_stage", answerText: "early_users" },
  {
    questionKey: "competitors_alternatives",
    answerText:
      "Manual email and spreadsheet admin, ad-hoc ChatGPT or Claude use, Zapier or Make for more advanced teams, hiring more admin staff, or just not automating.",
  },
];

const VERDICT_MARKDOWN = `# Pressure-Test Verdict

## Venture
- Venture name: FlowPilot AI

## Confirmed Q&A

### 1. Idea in one sentence
${VERDICT_RESPONSES[0].answerText}

### 2. Target customer
${VERDICT_RESPONSES[1].answerText}

### 3. Customer problem
${VERDICT_RESPONSES[2].answerText}

### 4. Business model
${VERDICT_RESPONSES[3].answerText}

### 5. Current stage
Early users

### 6. Competitors, alternatives, and doing nothing
${VERDICT_RESPONSES[5].answerText}

## AI Recommendation

**Recommendation:** Proceed

**Reason:** The problem is specific, the customer is nameable, and early users already exist. The open question is whether the beachhead segment is narrow enough to sell to repeatably.

## Five Failure Reasons

1. The team may not be able to narrow the beachhead enough to make outbound sales repeatable.
2. Zapier/Make already cover the advanced-team segment at a much lower price point.
3. Admin headcount is a known, budgeted cost — switching to a new tool has real change-management friction.
4. The buyer (managing partner) and the user (ops staff) are different people with different incentives.
5. A firm's practice-management vendor could add this feature natively and remove the need entirely.

## Competitors / Alternatives

1. Zapier / Make — cheaper, more flexible, but requires someone technical to set up and maintain.
2. Hiring more admin staff — the default, and the one most firms actually do today.
3. Manual email and spreadsheet admin plus ad-hoc ChatGPT use — free, already in place, good enough for many firms.

**Evidence note:** Pricing tolerance and willingness to switch are assumptions. Early user counts and workflow pain points come from direct conversations, not third-party research.

## Success Conditions

Ten accounting firms in the beachhead segment adopt FlowPilot AI within onboarding season and are still active users at month three.

## Investor Decision

**Decision:** Yes

**Single biggest reason:** A specific, reachable beachhead with real early users and a clear wedge against a known workaround.

## Recommended Next Step

Narrow the beachhead to one specific firm size and toolset combination, then run five more structured interviews against exactly that profile.

## Working Notes / Unresolved Assumptions

- Whether firms above 20 staff feel the same urgency is unverified.
- Long-term willingness to pay beyond the first onboarding season is assumed, not observed.
`;

const AVATAR_RESPONSES: { questionKey: string; answerText: string }[] = [
  {
    questionKey: "customer_picture",
    answerText:
      "Ops or practice manager inside a 5-20 person accounting firm juggling 3-4 disconnected tools; the ops team are the daily users, the ops manager champions adoption, and the managing partner approves the spend.",
  },
  {
    questionKey: "beachhead_segment",
    answerText:
      "Small accounting firms, 5-20 people, already using 3+ disconnected tools.",
  },
  {
    questionKey: "customer_where",
    answerText:
      "ANZ, found through CPA Australia / CA ANZ member directories and Xero/MYOB user communities.",
  },
  {
    questionKey: "commercial_moment",
    answerText:
      "The upcoming quarter-end close, the first with a new client included.",
  },
  {
    questionKey: "customer_situation",
    answerText:
      "A new client comes on during busy season. The ops person tries to move the client's documents from email into the practice-management tool by hand, falls behind, and something gets missed. The partner ends up chasing it personally, and if nothing changes the firm either caps how many new clients it takes or the ops person burns out.",
  },
  {
    questionKey: "functional_needs",
    answerText:
      "They need to move client information between systems without retyping it, so that nothing gets dropped.\nThey need one place to see onboarding status, so that nothing falls through the cracks.\nThey need confidence that a deadline will not be missed, so that they are not firefighting.",
  },
  {
    questionKey: "emotional_needs",
    answerText:
      "They fear being the reason a client leaves.\nThey want to feel in control instead of dreading Monday mornings during onboarding season.\nThey want to feel credible in front of the managing partner rather than visibly behind.",
  },
  {
    questionKey: "current_alternatives",
    answerText:
      "Manually copying client details between email and the practice-management tool\nKeeping a shared spreadsheet to track onboarding status\nThe managing partner personally chasing missed steps",
  },
  {
    questionKey: "tier1_signals",
    answerText:
      "No pricing request, demo booking or pilot start has been identified yet.",
  },
  {
    questionKey: "tier2_signals",
    answerText:
      "Onboarding a client big enough to strain the current process\nHiring a junior who needs a documented process\nApproaching tax season",
  },
  {
    questionKey: "disqualifiers",
    answerText:
      "Solo practitioners - cannot justify the spend\nFirms with 200+ staff - need a fully custom integration not yet supported\nAnyone who wants the work done for them rather than using the tool",
  },
  {
    questionKey: "core_promise",
    answerText:
      "Confidence that nothing falls through the cracks during onboarding, without adding headcount - getting their evenings back during busy season, within the first full onboarding cycle.",
  },
  { questionKey: "validation_status", answerText: "interviewed" },
];

// Deliberately includes an arrow, two checkmarks and a Polish stroked-L
// name inside "Founder assumptions" — validation_status's third
// subsection, i.e. exactly the `validation_status.3` field the original
// WORKBOOK_RENDER_FAILED report named.
const AVATAR_MARKDOWN = `# Ideal Customer Avatar

## Venture
- Venture name: FlowPilot AI

## Segment

Small accounting firms, 5-20 people, already using 3+ disconnected tools.

## Snapshot

**WHO:** Ops or practice manager inside a 5-20 person accounting firm juggling 3-4 disconnected tools; the ops team are the daily users, the ops manager champions adoption, and the managing partner approves the spend.

**WHERE:** ANZ, found through CPA Australia / CA ANZ member directories and Xero/MYOB user communities.

**CURRENT COMMERCIAL MOMENT:** The upcoming quarter-end close, the first with a new client included.

## Situation

A new client comes on during busy season. The ops person tries to move the client's documents from email into the practice-management tool by hand, falls behind, and something gets missed. The partner ends up chasing it personally, and if nothing changes the firm either caps how many new clients it takes or the ops person burns out.

## Unmet Needs

### Functional — what they need done

1. They need to move client information between systems without retyping it, so that nothing gets dropped.
2. They need one place to see onboarding status, so that nothing falls through the cracks.
3. They need confidence that a deadline will not be missed, so that they are not firefighting.

### Emotional and social — what they feel

1. They fear being the reason a client leaves.
2. They want to feel in control instead of dreading Monday mornings during onboarding season.
3. They want to feel credible in front of the managing partner rather than visibly behind.

## Current Alternatives

- Manually copying client details between email and the practice-management tool
- Keeping a shared spreadsheet to track onboarding status
- The managing partner personally chasing missed steps

## Buying Signals

### Tier 1 — high intent (act in 24–48 hrs)

No pricing request, demo booking or pilot start has been identified yet.

### Tier 2 — building intent, nurture over 4–12 weeks

- Onboarding a client big enough to strain the current process
- Hiring a junior who needs a documented process
- Approaching tax season

## Disqualifiers

- Solo practitioners — cannot justify the spend
- Firms with 200+ staff — need a fully custom integration not yet supported
- Anyone who wants the work done for them rather than using the tool

## Core Promise

Confidence that nothing falls through the cracks during onboarding, without adding headcount — getting their evenings back during busy season, within the first full onboarding cycle.

## Validation Status

This section records the evidence available when this version of the Avatar was created. It is a
current snapshot, not a final validation verdict.

**Current level:** Interviewed

### Based on observation

Six ops managers at ANZ accounting firms described the same manual copy-and-check workflow during onboarding and month-end close, independently of each other.

### Founder assumptions

The founder assumes the managing partner → ops manager → admin staff reporting line holds at every firm this size, and that a firm using ✓ Xero and ✓ MYOB together is a stronger fit than one using either alone. One interviewee, Łukasz, described the same pattern at a firm using a shared inbox for client email.

### Important unknowns

Whether firms above 20 staff still feel this pain as acutely, or whether they have already hired a dedicated ops hire to absorb it, is not yet known.

### Contradicting evidence

Not tested yet.

### Highest-priority validation questions

Does the managing partner → ops manager → admin staff reporting line hold at firms outside the six interviewed? Do firms using only one practice tool, not three or more, still feel enough urgency to buy?
`;

async function seedFounder(deps: Deps): Promise<string> {
  await deps.auth.api.signUpEmail({
    body: { name: "PDF Test Founder", email: EMAIL, password: PASSWORD },
  });
  const result = await deps.pool.query<{ id: string }>(
    "update users set role = 'founder' where email = $1 returning id",
    [EMAIL],
  );
  const userId = result.rows[0]?.id;
  if (!userId) {
    throw new Error(`Sign-up did not create a user for ${EMAIL}.`);
  }
  return userId;
}

async function createWorkspaceAndVenture(
  deps: Deps,
  userId: string,
): Promise<string> {
  const workspace = await deps.pool.query<{ id: string }>(
    `insert into workspaces (founder_user_id, name, slug)
     values ($1, 'FlowPilot AI workspace', 'module2-pdf-test-workspace') returning id`,
    [userId],
  );
  const venture = await deps.pool.query<{ id: string }>(
    `insert into ventures (workspace_id, created_by_user_id, name, slug, one_liner)
     values ($1, $2, 'FlowPilot AI', 'module2-pdf-test-venture', $3) returning id`,
    [
      workspace.rows[0].id,
      userId,
      "AI-driven automation of repetitive client and admin workflows for small professional service firms.",
    ],
  );
  const ventureId = venture.rows[0].id;
  await deps.setActiveVenture(founderActor(userId), ventureId);
  return ventureId;
}

async function driveModuleToCompletion(
  deps: Deps,
  actor: ActorContext,
  programRunId: string,
  moduleKey: string,
  responses: { questionKey: string; answerText: string }[],
  artifactKey: string,
  markdown: string,
): Promise<void> {
  const moduleRow = await deps.pool.query<{ id: string }>(
    `select id from program_run_modules where program_run_id = $1 and module_key = $2`,
    [programRunId, moduleKey],
  );
  const programRunModuleId = moduleRow.rows[0]?.id;
  if (!programRunModuleId) {
    throw new Error(`No ${moduleKey} run module on run ${programRunId}.`);
  }

  const { attempt } = await deps.startOrResumeAttempt(actor, {
    programRunModuleId,
  });

  for (const response of responses) {
    await deps.saveFounderResponse(actor, {
      attemptId: attempt.id,
      questionKey: response.questionKey,
      value: response.answerText,
    });
  }

  await deps.saveArtifactSubmission(actor, {
    attemptId: attempt.id,
    artifactKey,
    content: markdown,
  });

  const completion = await deps.completeModuleAttempt(actor, {
    attemptId: attempt.id,
  });
  if (!completion.passed) {
    const detail = [
      ...completion.missingArtifactKeys.map((k) => `missing artifact "${k}"`),
      ...completion.validationErrors.map((e) => `${e.key}: ${e.message}`),
    ].join("; ");
    throw new Error(`${moduleKey} did not pass validation — ${detail}`);
  }

  await deps.confirmModuleCompletion(actor, { programRunModuleId });
}

async function clean(deps: Deps): Promise<void> {
  const users = await deps.pool.query<{ id: string }>(
    "select id from users where email = $1",
    [EMAIL],
  );
  const ids = users.rows.map((row) => row.id);
  if (ids.length === 0) return;
  await deps.pool.query(
    "delete from artifact_submissions where workspace_id in (select id from workspaces where founder_user_id = any($1::uuid[]))",
    [ids],
  );
  await deps.pool.query(
    "delete from user_active_contexts where user_id = any($1::uuid[])",
    [ids],
  );
  await deps.pool.query(
    "delete from ventures where workspace_id in (select id from workspaces where founder_user_id = any($1::uuid[]))",
    [ids],
  );
  await deps.pool.query(
    "delete from workspaces where founder_user_id = any($1::uuid[])",
    [ids],
  );
  await deps.pool.query("delete from users where id = any($1::uuid[])", [ids]);
}

async function main(): Promise<void> {
  assertLocalDatabase();
  const deps = await loadDeps();
  try {
    await clean(deps);

    if (process.argv.includes("--clean")) {
      console.log(
        "Removed the seeded module2-pdf-test account (if it existed).",
      );
      return;
    }

    const userId = await seedFounder(deps);
    const actor = founderActor(userId);
    const ventureId = await createWorkspaceAndVenture(deps, userId);

    const { run } = await deps.getOrCreateProgramRun(actor, { ventureId });
    const setup = await deps.autoCompleteSetupModule(actor, {
      programRunId: run.id,
    });
    if (setup.status === "failed") {
      throw new Error(`Could not complete the setup module: ${setup.reason}`);
    }

    await driveModuleToCompletion(
      deps,
      actor,
      run.id,
      MODULE_1_KEY,
      VERDICT_RESPONSES,
      VERDICT_ARTIFACT_KEY,
      VERDICT_MARKDOWN,
    );
    await driveModuleToCompletion(
      deps,
      actor,
      run.id,
      MODULE_2_KEY,
      AVATAR_RESPONSES,
      AVATAR_ARTIFACT_KEY,
      AVATAR_MARKDOWN,
    );

    console.log(`\nSeeded and logged in as:`);
    console.log(`  email:    ${EMAIL}`);
    console.log(`  password: ${PASSWORD}`);
    console.log(
      `\nModule 1 and Module 2 are both completed. Open /artefacts to download the Ideal Customer Avatar as PDF — its "Founder assumptions" field deliberately contains an arrow, two checkmarks and "Łukasz" to exercise the font-coverage fix.`,
    );
    console.log(`\nRun again with --clean to remove this account.`);
  } finally {
    await deps.pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
