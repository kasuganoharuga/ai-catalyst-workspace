/**
 * Seeds signable-in Founder accounts covering each state the onboarding
 * screens branch on, so they can be eyeballed without walking the whole
 * flow by hand every time.
 *
 * Local development only. It refuses to run against anything that doesn't
 * look like a local database, and every account shares one well-known
 * password that is printed to the console — none of this is safe anywhere
 * a real person could reach it.
 *
 *   pnpm --filter web seed:test-founders
 *   pnpm --filter web seed:test-founders -- --clean
 *
 * Accounts go through the real Better Auth sign-up path rather than having
 * a password hash written by hand: the hashing is Better Auth's business,
 * and a fixture that guesses its format silently stops working on the next
 * version bump.
 */
import { randomUUID } from "node:crypto";
import path from "node:path";

import { config as loadEnv } from "dotenv";

import type { ActorContext } from "@ai-catalyst/contracts/actor-context";

// Must run before importing anything that reads process.env at module load
// time (lib/auth.ts's BETTER_AUTH_SECRET, @ai-catalyst/db's DATABASE_URL) —
// hence the dynamic imports in loadDeps() rather than static ones, which
// Node would otherwise evaluate before this call. Same reason as
// scripts/check-auth-schema.ts.
loadEnv({ path: path.resolve(__dirname, "../.env.local") });

// Every seeded address ends with this, which is also how --clean finds
// them again. A real founder can never collide with it.
const EMAIL_DOMAIN = "seed.test";
const PASSWORD = "TestFounder!2026";
const CLIENT_ID = "seed-test-claude-client";

type Deps = {
  pool: typeof import("@ai-catalyst/db").pool;
  auth: typeof import("../lib/auth").auth;
  getOrCreateProgramRun: typeof import("@ai-catalyst/services/workflow").getOrCreateProgramRun;
  autoCompleteSetupModule: typeof import("@ai-catalyst/services/module/auto-setup").autoCompleteSetupModule;
  updateMyProfile: typeof import("@ai-catalyst/services/profile").updateMyProfile;
  setActiveVenture: typeof import("@ai-catalyst/services/workspace/active-context").setActiveVenture;
  startOrResumeAttempt: typeof import("@ai-catalyst/services/attempt").startOrResumeAttempt;
  saveFounderResponse: typeof import("@ai-catalyst/services/attempt").saveFounderResponse;
  saveArtifactSubmission: typeof import("@ai-catalyst/services/artifact").saveArtifactSubmission;
  completeModuleAttempt: typeof import("@ai-catalyst/services/module/completion").completeModuleAttempt;
};

async function loadDeps(): Promise<Deps> {
  const [
    db,
    authModule,
    workflow,
    autoSetup,
    profile,
    activeContext,
    attempt,
    artifact,
    completion,
  ] = await Promise.all([
    import("@ai-catalyst/db"),
    import("../lib/auth"),
    import("@ai-catalyst/services/workflow"),
    import("@ai-catalyst/services/module/auto-setup"),
    import("@ai-catalyst/services/profile"),
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
    updateMyProfile: profile.updateMyProfile,
    setActiveVenture: activeContext.setActiveVenture,
    startOrResumeAttempt: attempt.startOrResumeAttempt,
    saveFounderResponse: attempt.saveFounderResponse,
    saveArtifactSubmission: artifact.saveArtifactSubmission,
    completeModuleAttempt: completion.completeModuleAttempt,
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
      `Refusing to seed test accounts: DATABASE_URL does not look local (${url.replace(
        /:[^:@]+@/,
        ":***@",
      )}).`,
    );
  }
}

function founderActor(userId: string): ActorContext {
  return { userId, role: "founder", source: "web" };
}

const MODULE_1_KEY = "module-01-pressure-test";
const VERDICT_ARTIFACT_KEY = "pressure_test_verdict";

// Answers to Module 1's six core questions, plus the decision. Written out
// rather than left as filler because the confirm step renders them back and
// lorem ipsum tells you nothing about whether the layout holds.
const VERDICT_RESPONSES: { questionKey: string; answerText: string }[] = [
  {
    questionKey: "idea_one_sentence",
    answerText:
      "A shared inbox for ANZ pre-seed founders that turns investor cold emails into a tracked pipeline.",
  },
  {
    questionKey: "target_customer",
    answerText:
      "ANZ pre-seed SaaS founders raising their first $500k who have cold-emailed 50+ investors and stalled.",
  },
  {
    questionKey: "customer_problem",
    answerText:
      "They lose track of who replied, who went quiet, and what they promised to send. The pipeline lives in a spreadsheet nobody updates after week two.",
  },
  {
    questionKey: "business_model",
    answerText:
      "$49/month per founder, billed while actively raising. Expected to churn once the round closes, which is fine.",
  },
  { questionKey: "current_stage", answerText: "prototype" },
  {
    questionKey: "competitors_alternatives",
    answerText:
      "Airtable templates, Affinity (priced for funds not founders), and the default: a Google Sheet plus memory.",
  },
  { questionKey: "founder_decision", answerText: "proceed" },
];

// Fills PRESSURE_TEST_VERDICT_TEMPLATE properly: the v2 validator checks
// section presence, list lengths (five failure reasons, three named
// alternatives) and the enum answers, so a half-filled document would land
// in validation_failed instead of ready_for_review.
const VERDICT_MARKDOWN = `# Pressure-Test Verdict

## Venture
- Venture name: Seeded Venture

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
Prototype

### 6. Competitors, alternatives, and doing nothing
${VERDICT_RESPONSES[5].answerText}

## AI Recommendation

**Recommendation:** Proceed

**Reason:** The problem is specific, the customer is nameable, and the founder has already run the manual version fifty times. The risk is willingness to pay during a raise, not whether the pain exists.

## Five Failure Reasons

1. Founders will not pay for a tool during the exact months they are most cash-constrained.
2. The pain lasts one raise, so churn is structural rather than a retention problem to fix.
3. A Google Sheet is free, already open, and good enough for a 50-investor list.
4. The buyer and the user are the same overloaded person with no time to adopt anything.
5. Affinity or Attio could add a founder tier and take the segment overnight.

## Competitors / Alternatives

1. Affinity — built and priced for funds, not for the founder side of the table.
2. Airtable investor-CRM templates — free, instantly available, no onboarding.
3. A Google Sheet plus memory — the real default, and the one that actually wins today.

**Evidence note:** Pricing and churn expectations are assumptions. No founder has been asked to pay yet. The 50-investor figure comes from the founder's own raise, not from interviews.

## Success Conditions

Ten ANZ founders currently raising pay $49/month within four weeks of a cold outreach, and at least six of them still log in during week three.

## Investor Decision

**Decision:** No

**Single biggest reason:** Nothing yet separates this from a spreadsheet in the buyer's mind, and no one has paid.

## Recommended Next Step

Interview twelve founders mid-raise this fortnight, ask what they currently use, and take a $49 pre-payment from three of them before writing more code.

## Founder's Decision

### Decision
Proceed

### Pivot detail, if applicable
Not applicable.

## Working Notes / Unresolved Assumptions

- Willingness to pay during a raise is unverified.
- Churn after the round closes is assumed acceptable but has not been modelled.
`;

/**
 * Moves the credential row's `updated_at` forward, which is what
 * hasChangedInvitationPassword reads.
 *
 * Not an actual password change: `authClient.changePassword` is a
 * browser-side call, and re-hashing by hand would put this script back in
 * the business of guessing Better Auth's hash format. The timestamp is
 * the whole signal, so moving the timestamp is a faithful fixture.
 */
async function fakeChangedPassword(deps: Deps, userId: string): Promise<void> {
  await deps.pool.query(
    `update accounts
     set updated_at = now() + interval '5 minutes'
     where user_id = $1 and provider_id = 'credential'`,
    [userId],
  );
}

interface SeedSpec {
  label: string;
  displayName: string;
  /** What this account is for — printed at the end. */
  shows: string;
  profileName: { firstName: string; lastName: string } | null;
  connected: boolean;
  /**
   * Whether this founder has replaced the password their invitation
   * shipped with. Drives the dashboard's password prompt, which is a
   * separate signal from the profile name — the two must be settable
   * independently or the prompt can't be seen to behave.
   */
  passwordChanged: boolean;
  run: "none" | "setup-open" | "module-1" | "verdict-saved";
}

const SPECS: SeedSpec[] = [
  {
    label: "new",
    displayName: "New Founder",
    shows:
      "First visit. No name, not connected: greeting reads Welcome (not Welcome back), profile prompt showing, next action is Connect Claude.",
    profileName: null,
    connected: false,
    passwordChanged: false,
    run: "none",
  },
  {
    label: "named",
    displayName: "Named Founder",
    shows:
      "Name filled, still not connected: profile prompt gone, next action still Connect Claude.",
    profileName: { firstName: "Ada", lastName: "Lovelace" },
    connected: false,
    passwordChanged: false,
    run: "none",
  },
  {
    label: "connected",
    displayName: "Connected Founder",
    shows:
      "Connected, no run yet. Continue should complete the setup module server-side and land on Module 1 — no Module 0 screen anywhere.",
    profileName: { firstName: "Grace", lastName: "Hopper" },
    connected: true,
    passwordChanged: true,
    run: "none",
  },
  {
    label: "stuck",
    displayName: "Stuck Founder",
    shows:
      "The migration case: a run from before this change, Module 0 in_progress with a draft attempt, Module 1 locked. Continue should unstick it.",
    profileName: { firstName: "Karen", lastName: "Sparck Jones" },
    connected: true,
    passwordChanged: true,
    run: "setup-open",
  },
  {
    label: "module1",
    displayName: "Module One Founder",
    shows:
      "Setup already completed server-side: returning-visitor greeting, Module 1 open and waiting.",
    profileName: { firstName: "Barbara", lastName: "Liskov" },
    connected: true,
    passwordChanged: true,
    run: "module-1",
  },
  {
    label: "verdict",
    displayName: "Verdict Founder",
    shows:
      "Module 1 with a saved, validated verdict awaiting sign-off. Open step 3 to see the document rendered inline.",
    profileName: { firstName: "Radia", lastName: "Perlman" },
    connected: true,
    passwordChanged: true,
    run: "verdict-saved",
  },
];

async function createSignedUpFounder(
  deps: Deps,
  label: string,
  displayName: string,
): Promise<string> {
  const email = `${label}@${EMAIL_DOMAIN}`;

  // The real sign-up path, so the credential row and its hash are whatever
  // this version of Better Auth actually expects.
  await deps.auth.api.signUpEmail({
    body: { name: displayName, email, password: PASSWORD },
  });

  // A new user starts at role 'pending' (forced by the databaseHooks in
  // lib/auth.ts). Promoting to 'founder' is what invitation acceptance
  // would normally do.
  const result = await deps.pool.query<{ id: string }>(
    "update users set role = 'founder' where email = $1 returning id",
    [email],
  );
  const userId = result.rows[0]?.id;
  if (!userId) {
    throw new Error(`Sign-up did not create a user for ${email}.`);
  }
  return userId;
}

async function createWorkspaceAndVenture(
  deps: Deps,
  userId: string,
  label: string,
): Promise<string> {
  const workspace = await deps.pool.query<{ id: string }>(
    `insert into workspaces (founder_user_id, name, slug)
     values ($1, $2, $3) returning id`,
    [userId, `${label} workspace`, `seed-${label}-${randomUUID()}`],
  );
  const venture = await deps.pool.query<{ id: string }>(
    `insert into ventures (workspace_id, created_by_user_id, name, slug, one_liner)
     values ($1, $2, $3, $4, $5) returning id`,
    [
      workspace.rows[0].id,
      userId,
      `${label} venture`,
      `seed-venture-${label}-${randomUUID()}`,
      "A seeded venture for testing the onboarding screens.",
    ],
  );
  const ventureId = venture.rows[0].id;
  await deps.setActiveVenture(founderActor(userId), ventureId);
  return ventureId;
}

/**
 * Fakes what a completed connector approval leaves behind: an unexpired
 * access token against an enabled public client, plus the consent row.
 * That is exactly the pair getMcpConnectionStatus reads, so the UI treats
 * the account as connected without a real OAuth round trip.
 *
 * The token is a display fixture, not a working credential — nothing
 * seeded here should be able to call an MCP tool.
 */
async function fakeMcpConnection(deps: Deps, userId: string): Promise<void> {
  await deps.pool.query(
    `insert into mcp_oauth_applications
       (name, client_id, client_secret, redirect_urls, type, disabled)
     values ('Claude (seeded test client)', $1, '', 'http://localhost/callback', 'public', false)
     on conflict (client_id) do nothing`,
    [CLIENT_ID],
  );
  // One hour, matching auth.ts's accessTokenExpiresIn. This used to be 30
  // days, which quietly made the fixtures unable to reproduce the bug they
  // were most useful for: a token that outlives the founder's intent is
  // exactly what "I disconnected but the site still says connected" is
  // about, and a month-long token hides how long that window really is.
  await deps.pool.query(
    `insert into mcp_oauth_access_tokens
       (access_token, refresh_token, access_token_expires_at,
        refresh_token_expires_at, client_id, user_id, scopes)
     values ($1, $2, now() + interval '1 hour', now() + interval '7 days', $3, $4, 'mcp:connect')`,
    [
      `seed-access-${randomUUID()}`,
      `seed-refresh-${randomUUID()}`,
      CLIENT_ID,
      userId,
    ],
  );
  await deps.pool.query(
    `insert into mcp_oauth_consents (client_id, user_id, scopes, consent_given)
     values ($1, $2, 'mcp:connect', true)`,
    [CLIENT_ID, userId],
  );
}

async function seedOne(deps: Deps, spec: SeedSpec): Promise<void> {
  const userId = await createSignedUpFounder(
    deps,
    spec.label,
    spec.displayName,
  );
  const actor = founderActor(userId);
  const ventureId = await createWorkspaceAndVenture(deps, userId, spec.label);

  if (spec.profileName) {
    await deps.updateMyProfile(actor, spec.profileName);
  }
  if (spec.connected) {
    await fakeMcpConnection(deps, userId);
  }
  if (spec.passwordChanged) {
    await fakeChangedPassword(deps, userId);
  }

  if (spec.run === "setup-open") {
    const { run } = await deps.getOrCreateProgramRun(actor, { ventureId });
    // Leave Module 0 exactly where a founder mid-flow would have left it
    // before this change: open, with a draft attempt and nothing saved.
    const setupModule = await deps.pool.query<{ id: string }>(
      `select m.id from program_run_modules m
       join module_definitions d on d.id = m.module_definition_id
       where m.program_run_id = $1 and d.module_type = 'setup'`,
      [run.id],
    );
    if (setupModule.rows[0]) {
      await deps.startOrResumeAttempt(actor, {
        programRunModuleId: setupModule.rows[0].id,
      });
    }
  }

  if (spec.run === "module-1" || spec.run === "verdict-saved") {
    const { run } = await deps.getOrCreateProgramRun(actor, { ventureId });
    const outcome = await deps.autoCompleteSetupModule(actor, {
      programRunId: run.id,
    });
    if (outcome.status === "failed") {
      throw new Error(
        `Seeding "${spec.label}" could not complete the setup module: ${outcome.reason}`,
      );
    }

    if (spec.run === "verdict-saved") {
      await seedSavedVerdict(deps, actor, run.id);
    }
  }
}

/**
 * Takes Module 1 all the way to "saved and passed its checks", which is the
 * only state where the confirm step has a document to show.
 */
async function seedSavedVerdict(
  deps: Deps,
  actor: ActorContext,
  programRunId: string,
): Promise<void> {
  const moduleRow = await deps.pool.query<{ id: string }>(
    `select id from program_run_modules
     where program_run_id = $1 and module_key = $2`,
    [programRunId, MODULE_1_KEY],
  );
  const programRunModuleId = moduleRow.rows[0]?.id;
  if (!programRunModuleId) {
    throw new Error(`No ${MODULE_1_KEY} run module on run ${programRunId}.`);
  }

  const { attempt } = await deps.startOrResumeAttempt(actor, {
    programRunModuleId,
  });

  for (const response of VERDICT_RESPONSES) {
    await deps.saveFounderResponse(actor, {
      attemptId: attempt.id,
      questionKey: response.questionKey,
      value: response.answerText,
    });
  }

  await deps.saveArtifactSubmission(actor, {
    attemptId: attempt.id,
    artifactKey: VERDICT_ARTIFACT_KEY,
    content: VERDICT_MARKDOWN,
  });

  const completion = await deps.completeModuleAttempt(actor, {
    attemptId: attempt.id,
  });
  if (!completion.passed) {
    const detail = [
      ...completion.missingArtifactKeys.map((k) => `missing artifact "${k}"`),
      ...completion.validationErrors.map((e) => `${e.key}: ${e.message}`),
    ].join("; ");
    throw new Error(`Seeded verdict did not pass validation — ${detail}`);
  }
}

async function clean(deps: Deps): Promise<number> {
  const users = await deps.pool.query<{ id: string }>(
    "select id from users where email like $1",
    [`%@${EMAIL_DOMAIN}`],
  );
  const ids = users.rows.map((row) => row.id);
  if (ids.length === 0) {
    await deps.pool.query(
      "delete from mcp_oauth_applications where client_id = $1",
      [CLIENT_ID],
    );
    return 0;
  }

  await deps.pool.query(
    "delete from artifact_submissions where workspace_id in (select id from workspaces where founder_user_id = any($1::uuid[]))",
    [ids],
  );
  // Before the ventures: user_active_contexts holds a foreign key to the
  // active venture, and these accounts all have one (setActiveVenture runs
  // during seeding), so deleting ventures first fails on that constraint.
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
  await deps.pool.query(
    "delete from mcp_oauth_applications where client_id = $1",
    [CLIENT_ID],
  );
  return ids.length;
}

/**
 * Prints the signed session cookie for one seeded account, so a browser
 * can be dropped straight into a given state without walking the login
 * form. Only ever works for `@seed.test` addresses, whose password this
 * script generated in the first place.
 */
async function printSessionCookie(deps: Deps, label: string): Promise<void> {
  const email = `${label}@${EMAIL_DOMAIN}`;
  if (!SPECS.some((spec) => spec.label === label)) {
    throw new Error(
      `Unknown seeded account "${label}". Options: ${SPECS.map((s) => s.label).join(", ")}`,
    );
  }
  const response = await deps.auth.api.signInEmail({
    body: { email, password: PASSWORD },
    asResponse: true,
  });
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error(`No session cookie returned for ${email}.`);
  }
  // Just the name=value pair; the browser supplies its own attributes.
  console.log(setCookie.split(";")[0]);
}

async function main(): Promise<void> {
  assertLocalDatabase();
  const deps = await loadDeps();

  try {
    const sessionFlag = process.argv.indexOf("--session");
    if (sessionFlag !== -1) {
      await printSessionCookie(deps, process.argv[sessionFlag + 1] ?? "");
      return;
    }

    if (process.argv.includes("--clean")) {
      const removed = await clean(deps);
      console.log(
        removed === 0
          ? "Nothing to clean — no seeded accounts found."
          : `Removed ${removed} seeded account(s).`,
      );
      return;
    }

    // Re-runnable: clear any previous seed first so emails don't collide.
    await clean(deps);

    for (const spec of SPECS) {
      await seedOne(deps, spec);
      console.log(`  seeded ${spec.label}@${EMAIL_DOMAIN}`);
    }

    console.log(`\nAll accounts use the password: ${PASSWORD}\n`);
    for (const spec of SPECS) {
      console.log(`${spec.label}@${EMAIL_DOMAIN}`);
      console.log(`  ${spec.shows}\n`);
    }
  } finally {
    await deps.pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
