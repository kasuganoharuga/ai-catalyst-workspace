/**
 * Hand-authored, validator-passing content for Modules 2-6, used by
 * seed-test-founders.ts to walk one fixture founder all the way to "Module 7
 * open" so every module's Brief/Work screens — and a multi-module artefacts
 * list — can be screenshotted without doing the module content by hand.
 *
 * Modelled on seed-test-founders.ts's own Module 1 verdict fixture: content
 * is written directly against each module's real `structured_markdown_v1`
 * rule schema (packages/services/src/content-seed/content/module-{2..6}.ts),
 * not against the toolkit template's blank placeholders. Only the labels a
 * `submissionRule` actually checks (Module 2 and 3's `validation_status`) get
 * a matching Response saved — completeModuleAttempt does not otherwise
 * require every question answered, and the rest of Modules 2-6 have no
 * submission rules at all.
 *
 * Module 7 is deliberately not completed here: this fixture only needs
 * Module 7 *open* (its Brief/Work steps readable), which requires Module 6
 * confirmed and nothing about Module 7 itself. Module 7's own artefacts
 * (Business-Model.md's "Cost structure" section holds two Markdown tables
 * under one heading with no dividing subheading, which the shared table
 * parser reads as one merged table) are out of scope for this fixture.
 */

export interface ModuleFixtureArtifact {
  artifactKey: string;
  content: string;
}

export interface ModuleFixtureResponse {
  questionKey: string;
  value: string;
}

export interface ModuleFixture {
  moduleKey: string;
  responses: ModuleFixtureResponse[];
  artifacts: ModuleFixtureArtifact[];
}

// A consistent thread across Modules 2-6, carried over from Module 1's own
// seeded pressure-test verdict (seed-test-founders.ts), so the six saved
// documents read as one venture's story rather than six disconnected fixtures.
const VENTURE_NAME = "Seeded Venture";
const PRODUCT_NAME = "Investor Inbox";
const BEACHHEAD_CUSTOMER = "ANZ pre-seed SaaS founders mid-raise";

const MODULE_2_IDEAL_CUSTOMER_AVATAR = `# Ideal Customer Avatar

## Venture
- Venture name: ${VENTURE_NAME}

## Segment

${BEACHHEAD_CUSTOMER} who already have more inbound investor replies than they can track by hand.

## Snapshot

**WHO:** A solo or co-founder pair, three to nine months into a raise, doing their own outreach with no ops hire.

**WHERE:** Sydney, Melbourne and Auckland accelerator cohorts and their alumni Slack and Discord channels.

**CURRENT COMMERCIAL MOMENT:** Mid-raise, past the first warm intros, now cold-emailing investors from a spreadsheet nobody keeps up to date.

## Situation

The founder started the raise with a clean list of forty investors and a promise to themselves that they'd log every reply. By week three the spreadsheet is two weeks out of date, three investors who asked for a deck have not received one, and the founder cannot say who is still live without re-reading their own sent folder. Doing nothing means the raise slows down for a reason that has nothing to do with the pitch.

## Unmet Needs

### Functional — what they need done

1. See at a glance which investors are still active in the pipeline versus gone quiet.
2. Get reminded to follow up before a promised deck or intro goes stale.
3. Track what was promised to whom without re-reading the sent folder.

### Emotional and social — what they feel

1. Embarrassed sending a follow-up to someone they already forgot they'd emailed.
2. Anxious that a warm investor went cold because of a dropped follow-up, not the pitch.
3. Alone doing sales ops on top of building the product.

## Current Alternatives

- A shared Google Sheet that one co-founder updates and the other forgets to check.
- Airtable investor-CRM templates, set up once and abandoned after week two.
- Memory and the sent folder, searched by investor name whenever someone asks who replied.

## Buying Signals

### Tier 1 — high intent (act in 24–48 hrs)

- Missed a promised follow-up to an investor who replied within 24 hours.
- Said out loud in a founder Slack that they "lost track of who replied."
- Two co-founders gave different answers about the same investor's status.

### Tier 2 — building intent, nurture over 4–12 weeks

- Just opened a first round and set up a tracking sheet this week.
- Asked another founder how they keep their investor list organised.
- Mentioned raising in a founder community without a tracking complaint yet.

## Disqualifiers

- Pre-idea founders who have not started outreach yet.
- Founders using a full CRM (Affinity, Attio) already paid for by their accelerator.
- Solo founders raising under $100k who plan to self-fund past pre-seed.

## Core Promise

Never lose track of an investor conversation you already started — see who is still live, what you promised them, and what to do next, in one place instead of a spreadsheet and a search through Sent.

## Validation Status

This section records the evidence available when this version of the Avatar was created. It is a
current snapshot, not a final validation verdict.

**Current level:** Interviewed

### Based on observation

Twelve founders mid-raise described the same spreadsheet-goes-stale pattern unprompted, across three separate founder Slack channels.

### Founder assumptions

That the $49/month price point survives a founder's own cash-constrained raise budget is still assumed, not confirmed by a paying customer.

### Important unknowns

Whether founders who fundraise only once ever value a tool enough to recommend it to the next cohort, since churn is structural.

### Contradicting evidence

Two founders said they'd rather hire a fractional ops person than adopt another SaaS tool mid-raise.

### Highest-priority validation questions

Would a founder pay $49/month for this in week one of a raise, before the spreadsheet has visibly failed them yet?
`;

const MODULE_3_PROBLEM_STATEMENT = `# Problem Statement

## Venture
- Venture name: ${VENTURE_NAME}

## Statement

### Root-cause version

${BEACHHEAD_CUSTOMER} lose investor pipeline state because no tool captures reply status and promised next steps at the moment an email thread updates — so the spreadsheet is always one email behind reality, not because the founder is disorganised.

### Draft version

Founders are bad at keeping their investor spreadsheet updated during a raise.

## Five Whys Ladder

1. Why does the spreadsheet go stale? Because updating it is a second, manual step after every email, and email happens faster than the founder remembers to switch tabs.
2. Why doesn't the founder just update it in the moment? Because there is no signal in their inbox that says "this thread needs a pipeline update" — it looks like every other email.
3. Why is that the root cause and not simple neglect? Because the same founders keep detailed notes elsewhere when the tool gives them a reason to look — the failure is the missing prompt, not a lack of discipline.

## Root Cause

The investor pipeline lives in a separate tool from the inbox, so nothing prompts an update at the one moment an update is cheap — right as the reply arrives.

## Why This Is Urgent

A stale pipeline costs a raise its own momentum: a warm investor who doesn't hear back within a few days reads as disinterest, and by the time the founder notices the gap, the investor has often moved on to a competing deal.

## Validation Status

This section records the evidence available when this version of the Problem Statement was created.
It is a current snapshot, not a final validation verdict.

**Current level:** Interviewed

### Based on observation

Nine of twelve interviewed founders described discovering a missed follow-up only when the investor themselves chased it.

### Founder assumptions

That the root cause is the missing in-inbox prompt, rather than a training or habit problem, is still an assumption pending the next interview round.

### Important unknowns

Whether founders who use a power inbox already solve this well enough that the tool has nothing to add for that segment.

### Contradicting evidence

One founder said their VC's own CRM reminder emails already cover this for them, which would narrow the addressable segment.

### Highest-priority validation questions

Does the missed-follow-up moment happen inside the inbox, or earlier, at the point the founder decides not to log the reply at all?
`;

const MODULE_3_PROBLEM_INTERVIEW_GUIDE = `# Problem Interview Guide

## Venture
- Venture name: ${VENTURE_NAME}

## Interview Target

${BEACHHEAD_CUSTOMER}, three to nine months into an active raise, doing their own investor outreach without an ops hire.

## What This Interview Tests

Whether the missed-follow-up root cause lives in the inbox rather than in the spreadsheet or the founder's own discipline.

## Opening Script

Thanks for making time — I'm trying to understand how founders actually track investor conversations during a raise, not pitching anything today. Can I ask about a specific recent moment?

## Five Interview Questions

1. Walk me through the last time your investor spreadsheet was wrong about someone's status — what happened?
2. How often does that happen in a typical week of active fundraising?
3. What have you already tried or paid for to keep your pipeline organised?
4. What do you think is the actual reason the sheet falls behind, versus just not having time?
5. If this happened again tomorrow, would it change how you prioritise fixing it versus other raise tasks?

## Question Guidance

### Q1

**Listen for:**

- A specific email thread or investor name, not a general complaint.
- Whether they noticed the gap themselves or the investor pointed it out.
- How much time passed before they noticed.

**Suggestion:** Push for the exact week of the raise this happened, not "sometimes."

### Q2

**Listen for:**

- A frequency they can count (times per week), not "often."
- Whether it clusters around a specific raise stage.
- Any workaround they've already built to catch it earlier.

**Suggestion:** If they say "constantly," ask for the last three instances by date.

### Q3

**Listen for:**

- Named tools (Airtable, Notion, Affinity) rather than "a spreadsheet."
- Whether they paid money or just time to set it up.
- Whether they abandoned it, and why.

**Suggestion:** Ask what would have to be true for them to still be using it today.

### Q4

**Listen for:**

- Whether they blame the tool, their own habits, or the raise's pace.
- Any mention of the inbox being where the failure actually starts.
- Answers that contradict the hypothesis — do not discard them.

**Suggestion:** Ask "what would have had to be different in that moment" rather than "whose fault was it."

### Q5

**Listen for:**

- Whether they rank this above or below other raise fires.
- A concrete next action they'd take, not a general intention.
- Any prior attempt to fix this that stalled.

**Suggestion:** Ask what they would stop doing to make time for this instead.

## Mom Test Rules

- Ask about specific past instances, never about opinions or the future.
- Do not pitch the idea before or during the interview.
- Let silence sit — do not fill it with a leading suggestion.
- Write down the customer's own words, not a cleaned-up summary.

## Pass Bar

**Working validation thresholds:** The following pass/kill thresholds are AI-proposed for this
validation round. They are not market benchmarks or existing customer evidence.

**For this five-interview validation round, grade each lane separately. Label every condition
Problem, Root cause, or Urgency. Typical bar: at least 3 of 5 interviews satisfy each lane's
conditions below (calibrate windows to the confirmed pain cadence):**

- Problem: at least 3 of 5 founders describe a specific missed-update incident from memory, unprompted.
- Root cause: at least 3 of 5 attribute the gap to the update happening outside the inbox, not to their own discipline.
- Urgency: at least 3 of 5 describe a real cost — a cooled investor, a missed intro — tied to the gap.

## Kill Criteria

**Two patterns. True kills mean the problem is not worth pursuing and scope must change.
Patterns that only falsify the current root-cause hypothesis must say to re-run Five Whys / revise
the hypothesis — not to kill the problem:**

1. Fewer than 2 of 5 founders can recall a specific stale-pipeline incident at all.
2. A majority say an existing tool (their VC's CRM, a power inbox) already solves this for them.

## Assumptions Being Validated

Each conversation should move the needle on at least one of these. Note which questions generated
signal against each assumption.

| # | Assumption | Validated if… | Invalidated if… |
|---|---|---|---|
| 1 | The update gap happens at the inbox, not the spreadsheet | Founders describe forgetting right after reading the reply | Founders describe forgetting only when they sit down to update the sheet later |
| 2 | Founders would act on an in-inbox prompt | Founders say they'd have logged it immediately if reminded there | Founders say they'd ignore a prompt too |
| 3 | This is a raise-specific pain, not a general CRM gap | Founders stop caring the moment the round closes | Founders want to keep using it after closing |

## Closing Questions

Ask both at the end of every conversation, before any pitch:

- Is there anything about keeping your pipeline organised during a raise that I haven't asked about?
- Who else fundraising right now should I talk to?

## After Each Call

- Write the verbatim notes within 30 minutes, while they are still fresh.
- Record the customer's own words rather than replacing them with a summary. The summary is where
  the evidence quietly disappears.
- Record anything that contradicted the problem statement, especially when it was inconvenient.
- Keep each interview as a separate note.
- Keep the completed notes together — the next module reviews them.

## Where Results Go

Interview results are not recorded in this guide. Run the five conversations, keep the verbatim
notes, and bring them into the next module, which reviews the evidence they produced.

Three or four completed interviews are still worth reviewing — they simply have not completed this
round, so the pass bar above has not been met either way. Bring whatever you have.
`;

const MODULE_4_NORTH_STAR = `# North Star

## Venture
- Venture name: ${VENTURE_NAME}
- Product name / working title: ${PRODUCT_NAME}
- Category: Fundraising pipeline tracker for pre-seed founders

## Solution statement

- ${PRODUCT_NAME} is a fundraising pipeline tracker that helps ${BEACHHEAD_CUSTOMER} keep every investor conversation current by prompting the update right inside the email thread where the reply lands.

## Differentiator

### Current

- Every other tracker lives outside the inbox and depends on the founder remembering to switch tabs; ${PRODUCT_NAME} reads the reply and prompts the pipeline update in the same screen, at the moment it's cheapest to log.

### Rejected (strikethrough)

- ~~A full CRM with pipelines, tasks, and reporting~~ — founders don't want another tool to administer during a raise, they want the one moment a reply lands to not fall through.
`;

const MODULE_4_FEATURE_BENEFIT_MAP = `# Feature Benefit Map

## Venture
- Venture name: ${VENTURE_NAME}
- Product name / working title: ${PRODUCT_NAME}

## Feature brain dump

- Auto-detect an investor reply and prompt a pipeline status update inline.
- Weekly digest of investors who have gone quiet past their usual reply time.
- One-click "log this promise" when a founder tells an investor they'll send something.
- Shared view so co-founders see the same pipeline state without a sync call.
- Import an existing spreadsheet on day one instead of starting from zero.

## Minimum Loveable features (top 3)

| # | Feature | One-line definition |
|---|---|---|
| 1 | Inline reply prompt | Detects an investor reply and asks the founder to update status without leaving the thread |
| 2 | Stale-investor digest | Weekly list of investors overdue for a follow-up, based on their own reply cadence |
| 3 | Promise log | One-click capture of anything the founder told an investor they'd send, with a due date |

## Benefits

| Feature | Functional benefit | Emotional benefit |
|---|---|---|
| Inline reply prompt | Never updates the pipeline a day late | Stops the guilt of realising a reply sat unanswered |
| Stale-investor digest | Surfaces who needs a nudge before they go cold | Removes the anxiety of not knowing who's still live |
| Promise log | Nothing promised to an investor gets forgotten | Confidence walking into the next call prepared |

## Desirability Order

### Founder ranking

1. Inline reply prompt
2. Promise log
3. Stale-investor digest

### Facilitator ranking

1. Inline reply prompt
2. Stale-investor digest
3. Promise log

### Disagreement / reasoning

- The Founder ranks Promise log above Stale-investor digest because forgetting a specific promise feels worse day-to-day; the Facilitator ranks the digest higher because it catches problems the founder doesn't yet know exist. Both agree the reply prompt matters most.

## Assumption Risks

| Feature | Validated or assumed | What to learn | How to learn it |
|---|---|---|---|
| Inline reply prompt | Assumed | Whether founders will grant inbox read access at all | Ask directly in the next five interviews before building |
| Stale-investor digest | Assumed | What "overdue" threshold actually matches founder instinct | Compare founder-flagged stale contacts against a fixed day count |
| Promise log | Validated | That founders lose track of specific promises | Already observed unprompted in nine of twelve interviews |

### Feature the Founder would cut before launch

- A full reporting dashboard — no one asked for charts, they asked not to forget a reply.
`;

const MODULE_5_EPIC_CHARTER = `# Epic Charter

## Venture
- Venture name: ${VENTURE_NAME}
- Product name / working title: ${PRODUCT_NAME}

## Epic 1

**Title:** Inline Reply Prompt

**Goal:** As a founder mid-raise, I want to be prompted the moment an investor replies, so that the pipeline is never a day behind my own inbox.

**Success metric:** 80% of investor replies get a logged status update within one hour of arriving.

### Stories

#### Story 1.1

**Story:** As a founder, I want to see a one-tap status prompt on a detected investor reply, so that I can update the pipeline without leaving my inbox.

**INVEST notes:** Independent of the digest and promise-log epics; small enough to ship as a single inbox add-on; testable against real reply-detection accuracy.

**Acceptance criteria:**

1. Given an email from an address already in the pipeline, When the founder opens the reply, Then a status-update prompt appears inline within 5 seconds.
2. Given the founder dismisses the prompt, When they return to the thread later, Then the prompt still shows as unresolved.

## Epic 2

**Title:** Stale-Investor Digest

**Goal:** As a founder mid-raise, I want a weekly list of investors overdue for a follow-up, so that no one goes cold without me noticing.

**Success metric:** Founders act on at least one digest entry per week during an active raise.

### Stories

#### Story 2.1

**Story:** As a founder, I want a Monday digest of overdue investors, so that I can plan my follow-ups for the week.

**INVEST notes:** Depends on reply-cadence data already captured by Epic 1; valuable standalone even before the promise log ships.

**Acceptance criteria:**

1. Given an investor has had no reply logged for longer than their own average cadence, When Monday's digest generates, Then that investor appears on it.
2. Given a founder marks an investor as no longer live, When the next digest generates, Then that investor no longer appears.

## Epic 3

**Title:** Promise Log

**Goal:** As a founder, I want to log anything I promise an investor with a due date, so that nothing I've committed to gets forgotten.

**Success metric:** Fewer than 1 in 20 logged promises is completed more than 48 hours late.

### Stories

#### Story 3.1

**Story:** As a founder, I want to log a promise in one click from the reply thread, so that it doesn't require a separate app.

**INVEST notes:** Small and independently shippable; negotiable on whether reminders are push or email first.

**Acceptance criteria:**

1. Given the founder types "I'll send the deck by Friday" in a reply, When they tap Log promise, Then a due-Friday task is created against that investor.
2. Given a promise is due today, When the founder opens the app, Then it appears at the top of their list.
`;

const MODULE_5_SPRINT_BACKLOG = `# Sprint Backlog

## Venture
- Venture name: ${VENTURE_NAME}
- Product name / working title: ${PRODUCT_NAME}

## Scored backlog

| Priority | Epic | Story | Customer value (1–5) | Confidence (1–5) | Effort (1–5, 5=easiest) | Score | In Sprint 1? | MLP? |
|---|---|---|---|---|---|---|---|---|
| 1 | Inline Reply Prompt | 1.1 One-tap status prompt on reply | 5 | 4 | 4 | 13 | Yes | Yes |
| 2 | Promise Log | 3.1 One-click promise capture | 4 | 4 | 4 | 12 | Yes | Yes |
| 3 | Stale-Investor Digest | 2.1 Monday overdue digest | 4 | 3 | 3 | 10 | No | Yes |

## Sprint 1 commitment

- Ship Story 1.1 (inline reply prompt) and Story 3.1 (one-click promise log) — the two highest-scored stories, both touching the same reply-thread surface.

## Why this is the Loveable cut

### Above the line

- Inline reply prompt and promise log both act at the moment a reply lands, which is the single moment interviews showed founders actually lose track of state.

### Cut (below the line)

- Stale-investor digest waits for Sprint 2: it depends on reply-cadence data that only exists once Story 1.1 has been live for a full week.
`;

const MODULE_6_COMPETITIVE_LANDSCAPE = `# Competitive Landscape

## Venture
- Venture name: ${VENTURE_NAME}
- Product name / working title: ${PRODUCT_NAME}
- Beachhead customer: ${BEACHHEAD_CUSTOMER}

## Landscape

| Competitor | URL | Type (direct / indirect / status quo) | Verbatim headline | Primary user (stated) | Strength | Critical gap for our customer | Source |
|---|---|---|---|---|---|---|---|
| Affinity | affinity.co | Indirect | "Relationship intelligence for dealmakers" | VC and PE deal teams | Deep relationship-graph analytics | Priced and built for funds running hundreds of deals, not a solo founder running one raise | affinity.co homepage, viewed this week |
| Airtable (investor CRM templates) | airtable.com/templates | Status quo | "Organize anything, with anyone" | Anyone tracking any list | Free, instantly available, no onboarding | Generic base with no inbox connection — every update is still manual | airtable.com/templates, investor CRM template |
| A spreadsheet + memory | No product URL — a personal Google Sheet | Status quo | No headline — not a product | The founder themselves | Zero cost, already open | No prompt at the moment a reply arrives, so it drifts out of date | Founder interviews, this round |

### Gap statement

Every current alternative treats the pipeline as a separate surface from the inbox, so nothing prompts the founder at the one moment an update is cheap — when the reply itself arrives.

### Strongest case against the gap

A founder disciplined enough to check their tracker daily would close most of this gap without any new tool, which is why the interview evidence about habit, not just tooling, matters before over-building.

## Feature comparison

| Capability (customer criteria) | Affinity | Us | Notes |
|---|---|---|---|
| Reads replies inline in the inbox | No | Yes | Affinity is a separate app the founder must open |
| Priced for a solo pre-seed founder | No | Yes | Affinity's pricing targets fund-sized deal teams |
| Zero setup before first use | No | Yes | Import an existing spreadsheet on day one |

### Matrix verdict

No existing option combines inbox-native prompts with solo-founder pricing; the spreadsheet wins on cost alone, Affinity wins on features alone, but neither wins on both.

## Positioning map

**X-axis:** Inbox-native (0) to standalone tool (10)

**Y-axis:** Priced for a fund (0) to priced for a solo founder (10)

| Player | X (0–10) | Y (0–10) | Rationale |
|---|---|---|---|
| Affinity | 8 | 1 | Standalone deal-team platform priced per fund seat |
| Airtable templates | 6 | 7 | Standalone but free and usable solo |
| Us | 1 | 8 | Lives in the inbox, priced for one founder |

### White space we occupy

- The only option that reads the inbox directly instead of asking the founder to re-enter what already happened there.
- Priced for a single raise, not a fund's deal flow.
- No setup cost: import an existing spreadsheet instead of starting from zero.
`;

const MODULE_6_DEFENSIBLE_POSITION = `# Defensible Position

## Venture
- Venture name: ${VENTURE_NAME}
- Product name / working title: ${PRODUCT_NAME}

## Differentiation & moat

### Defensibility pillars

#### Pillar 1

**Name:** Inbox-native reply detection

**Structural mechanism:** Parsing replies at the moment they land in the founder's own inbox, rather than asking the founder to re-enter what happened in a separate tool.

**Status:** Emerging / Assumption

**Evidence or assumption basis:** Interviews show founders want this, but no working reply-parsing pipeline has been built or tested yet.

**Why it could compound with usage:** Every parsed reply improves the detection model for the next founder's inbox shape, without any founder doing extra work.

**Why it could become hard to copy within 18 months:** A competitor entering later would need the same volume of real inbox data to reach comparable accuracy, which takes calendar time to accumulate, not just engineering effort.

**What still must be proven or built:** A working reply-classification pipeline tested against real, messy investor-thread formatting across multiple email providers.

#### Pillar 2

**Name:** Raise-specific pricing and packaging

**Structural mechanism:** Priced and scoped for a single founder running one raise, undercutting fund-priced CRMs that assume a deal team.

**Status:** Evidence-backed

**Evidence or assumption basis:** Twelve interviewed founders independently named price as the reason they never adopted Affinity or a similar fund CRM.

**Why it could compound with usage:** Each cohort of founders who complete a raise and recommend the tool to the next cohort lowers acquisition cost further, since the raise cycle naturally refers new users.

**Why it could become hard to copy within 18 months:** An incumbent fund CRM would have to build and price an entirely separate solo-founder tier, cannibalising its own per-seat fund pricing.

**What still must be proven or built:** Whether the referral pattern between raise cohorts actually holds once measured, rather than assumed from interview goodwill.

#### Pillar 3

**Name:** Promise-log audit trail

**Structural mechanism:** A single running record of every commitment made to an investor, portable across the whole raise regardless of which email thread it started in.

**Status:** Emerging / Assumption

**Evidence or assumption basis:** Founders described forgetting specific promises unprompted, but no founder has used the promise log across a full raise yet.

**Why it could compound with usage:** The longer a raise runs, the more promises accumulate, and the more valuable a single audit trail becomes relative to scattered inbox search.

**Why it could become hard to copy within 18 months:** A competitor would need founders to trust it with a full commitment history, which takes a track record to earn, not just a feature to ship.

**What still must be proven or built:** Whether founders actually log promises consistently enough for the trail to be complete, rather than partial and therefore misleading.

### Rejected claims

| Claim | Why it fails as a moat |
|---|---|
| Network effects between founders | No feature yet connects one founder's usage to another's outcome — recommendation is not the same as a network effect |

## Why now

| Trigger | Evidence or assumption |
|---|---|
| Market / behaviour trigger | ANZ pre-seed raise volume has grown alongside more solo-founder deals with no ops hire — assumption, not yet measured directly |
| Technology or platform unlock | Modern email APIs now support the read-and-classify access this needs without a fragile browser extension |
| Evidence customers are looking now | Twelve unprompted interview mentions of the same spreadsheet-goes-stale complaint this round |
| Why incumbents have not filled it / cannot respond fast | Fund CRMs are built and priced around deal teams; retooling for a solo, price-sensitive founder segment cannibalises their own pricing |

## Why us

| Advantage | Evidence or assumption |
|---|---|
| Lived problem / domain position | Founding team ran their own raise on a spreadsheet that went stale in exactly this way |
| Traction (if any) | None yet — pre-launch, assumption only |
| Proprietary access (data, relationships, distribution, tech) | Access to twelve founder interviews and three accelerator cohort Slack channels for early distribution |
| Background / network speed or credibility | Founding team are alumni of the same accelerator cohorts the beachhead segment comes from |

## Closing position statement

${PRODUCT_NAME} wins the moment a reply lands, not the moment a founder remembers to check a separate tool — a structural advantage a fund-priced CRM has no reason to chase.
`;

export const MODULE_FIXTURES: ModuleFixture[] = [
  {
    moduleKey: "module-02-customer-avatar",
    responses: [{ questionKey: "validation_status", value: "interviewed" }],
    artifacts: [
      {
        artifactKey: "ideal_customer_avatar",
        content: MODULE_2_IDEAL_CUSTOMER_AVATAR,
      },
    ],
  },
  {
    moduleKey: "module-03-problem-statement",
    responses: [{ questionKey: "validation_status", value: "interviewed" }],
    artifacts: [
      { artifactKey: "problem_statement", content: MODULE_3_PROBLEM_STATEMENT },
      {
        artifactKey: "problem_interview_guide",
        content: MODULE_3_PROBLEM_INTERVIEW_GUIDE,
      },
    ],
  },
  {
    moduleKey: "module-04-solution-statement",
    responses: [],
    artifacts: [
      { artifactKey: "north_star", content: MODULE_4_NORTH_STAR },
      {
        artifactKey: "feature_benefit_map",
        content: MODULE_4_FEATURE_BENEFIT_MAP,
      },
    ],
  },
  {
    moduleKey: "module-05-epics-user-stories",
    responses: [],
    artifacts: [
      { artifactKey: "epic_charter", content: MODULE_5_EPIC_CHARTER },
      { artifactKey: "sprint_backlog", content: MODULE_5_SPRINT_BACKLOG },
    ],
  },
  {
    moduleKey: "module-06-competitive-analysis",
    responses: [],
    artifacts: [
      {
        artifactKey: "competitive_landscape",
        content: MODULE_6_COMPETITIVE_LANDSCAPE,
      },
      {
        artifactKey: "defensible_position",
        content: MODULE_6_DEFENSIBLE_POSITION,
      },
    ],
  },
];
