# Module 02 — Ideal Customer Avatar

## What we need you to review

1. **Do the eight conversation sections cover the right customer questions?**
2. **Does the final Ideal Customer Avatar include everything you expect?**
3. **Is any wording too detailed, unclear, or wrong for a founder to be asked?**

Nothing here is technical. How answers are stored, resumed and validated is a separate
implementation document and does not need your review.

---

## What this module does

Takes a founder from a broad customer category such as "startup founders" to one specific beachhead
customer, precise enough to go and find.

It produces one document: **Ideal Customer Avatar**.

The founder works through **eight conversation sections**. Some sections are handled across two or
three short exchanges, so the founder is never asked to answer several different things at once.

Module 1's answers are read first and replayed, so nothing already established gets asked again. The
AI narrows each answer to its sharpest defensible version, and the founder confirms it before
anything is recorded.

The Avatar records the founder's best current understanding. It is not treated as validated just
because it is finished — a profile honestly marked "assumed" is a legitimate result. This module
does not produce an interview plan or run any customer conversations.

---

## How the AI behaves

The AI is briefed as a consumer psychologist and market researcher who understands how customers
think, what they fear, what they want, and what influences their decision to act or buy.

Its operating principles:

- **Read Module 1 first** and never ask the founder to repeat something already established.
- **Narrow, don't interrogate.** Take a broad customer definition and converge it into one practical
  beachhead, showing the founder the sharper version rather than telling them theirs is too vague.
- **Challenge weak answers constructively** — at most two focused follow-ups per section, then move
  on. A founder who cannot answer something is never stuck.
- **Separate what is observed from what is believed.** Evidence, founder assumptions and important
  unknowns are recorded distinctly.
- **Never invent customer evidence.** Quotation marks are only used for words a customer actually
  said, and no section is padded with made-up content to look complete.
- **Never block completion** because something is still an assumption.

Two content rules govern what gets written: unmet needs are described as outcomes the customer wants,
never as product features; and buying signals must be something that could actually be seen,
searched for or measured.

*The full operational prompt is in the implementation document.*

---

## The eight conversation sections

`[Module 1: ...]` is replaced with the founder's actual earlier answer before the question is asked.

### 1. Who is the beachhead customer?

```
In Module 1 you described your target customer as:

    [Module 1: target customer]

Let's make that precise enough to recognise a real matching customer, then pick the sharpest slice
of it. You do not need to repeat what you already said — correct anything that has changed, then add
what is missing:

— Their specific role, or their life situation
— The organisation or environment they operate in
— Who experiences the problem, who decides, and who pays — and whether those are the same person
— The part of their role or day in which the problem appears

Then the question this whole module turns on: which specific customer type inside that group has the
greatest urgency and the clearest ability and authority to act? If the group is already specific,
tell me what makes it the strongest starting point rather than a neighbouring customer type.

Include age, income, education or personal lifestyle only where they materially affect how this
customer experiences the problem, makes the decision or pays.
```

### 2. Where and when are they a fit?

*Handled in up to three short exchanges: where → stage → commercial moment.*

```
Three things about where this customer can be identified, and when they become a strong fit.

Where do they actually exist? The country, city or market they operate in, the industry ecosystem
they sit inside, and one or two specific communities or networks where you could identify real
examples. Be specific — "LinkedIn" is not enough, while "the founder channel in the Stone & Chalk
community" is.

What has to already be true in their world before your problem becomes urgent — customers, revenue,
a team, a system, a licence, a contract? And what makes someone too early, or already too far along,
to be a fit? This is the customer's stage, not your venture's stage.

And what are they moving toward right now — the event or deadline that turns "someday" into "this
quarter"? A funding round, a renewal, a launch, an audit, a board meeting, a new budget year, a
compliance date, a season. What matters is that it creates a real reason to act now rather than
later.

If you are unsure about the stage boundary or the timing, say so and I will put up a few options
drawn from what you have already told me.
```

### 3. What situation makes the problem urgent?

```
In Module 1 you said the customer struggles with:

    [Module 1: customer problem]

Now take me to one concrete moment when that becomes urgent for the customer we just defined.

What triggers it, what are they trying to achieve, what do they do first, why does that fall short,
and what happens to them if nothing changes for another three to six months?

Use a real customer if you have one. If you are describing a composite or your best guess, tell me
and I will record it that way.
```

### 4. What do they need, functionally and emotionally?

*Functional layer first, then the emotional layer. The founder does not have to answer both at once.*

```
In Module 1 you described the problem as:

    [Module 1: customer problem]

and these current alternatives:

    [Module 1: current alternatives]

Two layers on top of that.

First, the functional layer. What outcomes does this specific customer need but cannot reliably
achieve today? Give me three to six, each finishing this sentence:

"They need to ______ so that ______."

These are outcomes they want to be true, not features they have asked for.

Second, the layer that decides whether they buy at all. For this customer, what does living with
those alternatives actually feel like?

— What exact words do they use when they complain about it to a friend or a peer?
— What do they fear will happen if they still cannot solve it?
— What would make them feel more confident, more credible, or more in control?

If you have heard the words directly, give them to me verbatim. If you are inferring, say so — I
will not put invented quotes in your profile.
```

### 5. How do we recognise intent?

```
Two timescales, both observable from the outside.

Right now: how would we recognise this customer at the moment they are actively trying to solve the
problem — not interested, actually acting? What would they do in the next 24 to 48 hours? Searches
they run, things they download, questions they post, templates they grab, people they ask. And what
observable commitment would show they have moved beyond interest — paying, approving the spend,
booking the next step, or bringing in the decision-maker?

Earlier: what events mean this customer will need you in four to twelve weeks, even though they are
not looking yet? A hire, a funding event, a new contract, a deadline appearing on the calendar, a
tool they adopt, a community they join, content they start consuming.

Both have to be things we could see, search for or measure. "They feel frustrated" is not a signal.

If you have observed these behaviours, say so. If not, give me your best current hypothesis and I
will record it as something still to be tested.
```

### 6. Who is not a fit?

```
Your business model from Module 1:

    [Module 1: business model]

Given how this makes money, who might experience the problem but still should not be treated as a
good customer?

Think about who cannot pay, who cannot approve the spend, who needs a different delivery model, who
is too early, who is already too far along, and who wants someone else to do the work entirely.

Tell me who you would turn away, and why.
```

### 7. What are they really buying?

```
Your Module 1 idea statement was:

    [Module 1: idea in one sentence]

Now take the product description out of it. What is this customer actually buying?

Not information alone. What result, clearer decision, reduced risk or retained capability does your
solution enable?

What is meaningfully different for this customer after it works, and in what timeframe? I will turn
it into one or two sentences and show it to you.
```

### 8. How much evidence supports this profile?

```
Before we finish, let's be honest about the evidence behind this customer profile.

Choose the highest evidence level reached for this exact customer profile — not for any customer you
have ever had.

ASSUMED — the profile is mainly based on your judgement, industry experience, observation or
desk research.
INTERVIEWED — you have spoken directly with one or more people who closely match this profile
about their experience of the problem.
PAYING — at least one customer who closely matches this profile has paid, or made an
equivalent commercial commitment, related to this problem.

Which level best describes the profile today?
```

---

## What comes out

One document, `Ideal-Customer-Avatar.md`, in this fixed structure. It matches the reference handout,
plus a final internal section recording how much evidence sits behind it.

The counts below apply when a section is answered. They are not quotas — a section the founder
cannot yet answer holds an honest statement of what is not known, recorded under Important unknowns
rather than filled with invented content.

```markdown
# Ideal Customer Avatar

## Venture
- Venture name:

## Segment

<The beachhead sentence. One sentence, specific enough to identify real examples through a practical
channel or account list.>

## Snapshot

**WHO:** <one short recognition line — Capital Raise density. Role / life situation / team shape.
Include user / champion / buyer only as compact clauses when material. No motivations or prose.>

**WHERE:** <one short recognition line: country, market, ecosystem, and one or two named communities
or networks>

**STAGE:** <one short recognition line of observable operating-state facts. No marketing description.
Move why-the-problem-bites-now to Situation; hard exclusions to Disqualifiers.>

**CURRENT COMMERCIAL MOMENT:** <the event or deadline they are moving toward>

## Situation

<One paragraph: the trigger, what they are trying to achieve, what they tried first, why it fell
short, and the consequence of doing nothing for another three to six months.>

## Unmet Needs

### Functional — what they need done

<3–6 items, most commercially significant first. Outcomes the customer wants to be true, never a
description of what we sell.>

### Emotional and social — what they feel

<3–6 items. Quotation marks only around words a customer actually said.>

## Buying Signals

### Tier 1 — high intent, act within 24–48 hours

<3–5 observable actions. Something that could be seen, searched for or measured.>

### Tier 2 — building intent, nurture over 4–12 weeks

<3–5 observable trigger events.>

## Disqualifiers

<3 or more. Who looks similar but is unlikely to buy, unlikely to benefit, or likely to end badly.>

## Core Promise

<One or two sentences describing the customer result and, where relevant, the risk reduced or the
capability retained. Say what they are really buying beyond the product itself.>

## Validation Status

<Internal, not customer-facing. Everything above stays clean; all evidence bookkeeping lands here.
It is a snapshot of what was known when this version was written, not a final verdict.>

**Current level:** Assumed / Interviewed / Paying

### Based on observation
### Founder assumptions
### Important unknowns
### Contradicting evidence
### Highest-priority validation questions
```

---

## Worked example

**Attached: `Capital-Raise-Founder-Example.md`** — the reference handout filled into this exact
structure, for an Australian pre-seed founder segment. It is the fastest way to check whether the
output is what you expect.
