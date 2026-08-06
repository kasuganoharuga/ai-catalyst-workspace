# Module 02: Target Customer

Define exactly who you are building for, why they need it now, and how you will validate them this
week.

## When to Use

Use this module after Module 01 Pressure-Test, when a founder needs to narrow a broad target
customer into a beachhead specific enough to interview this week.

## Required Inputs

- Module 01 confirmed responses: `target_customer`, `customer_problem`, `competitors_alternatives`
- Pain intensity signals
- Buying or adoption context
- Existing interview notes

## Expected Output

One Markdown artefact, `Ideal-Customer-Avatar.md` — the avatar plus an internal Validation Status
section.

This module defines who to go and talk to. It does not run the outreach, write interview questions,
or produce an interview plan, and it produces exactly one avatar file.

The avatar follows the locked structure in
[templates/Ideal-Customer-Avatar.md](../skills/module-02-customer-avatar/templates/Ideal-Customer-Avatar.md):

**Segment → Snapshot → Situation → Unmet Needs → Buying Signals → Disqualifiers → Core Promise**

then an internal **Validation Status** section recording what is actually proven.

The conversation that produces it — eight blocks resolving 13 fields, the facilitator prompt and the
artifact generator
prompt — is in
[prompts/module-02-prompt-set.md](../skills/module-02-customer-avatar/prompts/module-02-prompt-set.md).
A filled reference is in
[examples/Capital-Raise-Founder-Example.md](../skills/module-02-customer-avatar/examples/Capital-Raise-Founder-Example.md).

## How It Runs

Ask wide, probe, converge, confirm. The founder works through **eight conversation blocks**, not
thirteen questions:

| Block | Resolves |
|---|---|
| 1. Who is the beachhead customer? | WHO, Segment |
| 2. Where and when are they a fit? | WHERE, STAGE, commercial moment |
| 3. What situation makes the problem urgent? | Situation |
| 4. What do they need, functionally and emotionally? | Functional needs, Emotional needs |
| 5. How do we recognise intent? | Tier 1 signals, Tier 2 signals |
| 6. Who is not a fit? | Disqualifiers |
| 7. What are they really buying? | Core Promise |
| 8. How much evidence supports this profile? | Evidence level |

Each block asks once, converges into every field it covers, takes one confirmation, then saves each
field as its own response. Blocks that inherit a Module 01 answer replay it first — the founder
corrects and adds rather than repeating.

Two fields get an assisted flow, because founders rarely answer them cold: STAGE and the current
commercial moment. The assistant proposes two or three candidates drawn only from confirmed answers,
always offers "None of these", and never treats a candidate as confirmed until the founder picks it.

## Quality Bar

1. **Write needs, not features.** Every unmet need is an outcome the customer wants to be true — never a description of what we sell.
2. **Make signals observable.** A buying signal must be something that could be seen, searched for or measured: a search, a download, a post, an event.
3. **Tier by urgency.** Separate act-now from nurture. Same person, different message, different speed of response.
4. **The specificity test.** Could you identify ten real examples this afternoon, on LinkedIn or another specific channel? If not, it is not yet a beachhead.
5. **Completion is not validation.** The evidence level records what the founder has actually done — for this exact profile, not for any customer they have ever had. `Assumed` is a legitimate finishing state: this module produces a hypothesis and says honestly how much evidence sits behind it.

Target counts when a field is answered: 3–6 functional needs, 3–6 emotional and social needs, 3–5
Tier 1 signals, 3–5 Tier 2 signals, 3 or more disqualifiers, one core promise.

These are not quotas. A field the founder genuinely cannot answer holds an honest statement of what
is not yet known, with the gap recorded under Important unknowns — never invented content added to
reach a minimum.
