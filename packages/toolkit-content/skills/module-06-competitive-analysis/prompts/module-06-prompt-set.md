# Module 06 — Competitive analysis & differentiation

**Status: seeded.** Question rows live in `MODULE_6_CONTENT`
(`packages/services/src/content-seed/content/module-6.ts`). Facilitator and artifact-generator prompts
live in `content/prompts.ts` (`competitive_analysis_*`). This file is the reviewable mirror — keep it in
sync when either side changes.

Module 6 pressure-tests whether the venture has a real competitive position: landscape, feature
comparison, moat, positioning, why now, and why us — grounded in Modules 2–4 and live competitor
URLs the Founder pastes.

It produces two artefacts: `Competitive-Landscape.md` and `Defensible-Position.md`.

The module's shape is **landscape → compare → moat → position → why now/us**. Modules 2–4 locked
customer, problem, and solution; this module asks whether that solution can win. The skill it
teaches is refusing "no competitors", "better/faster/cheaper", and "first mover" as answers.

**No investor slide deck. No `.pptx` assembly.** Six slide briefs and a full pitch file are later
concerns. Two Markdown artefacts only — landscape data and defensible position live in those files,
not as a pile of Slide 08.x documents.

**No website Documents step:** read any Founder-submitted notes/files shared in chat at open; weave
into probes when useful; **do not skip or reorder blocks**. Prep-only claims are **assumptions**
until the Founder explicitly confirms them as evidence (or a live URL fetch backs the fact).

---

## 1. Field ownership

Every artefact field has exactly one question that owns it. Wide answers legitimately supply
material for later fields — persisted as carry-forward context (see §4) and replayed, never
re-asked from zero.

| Block | `question_key` | Owns | Also supports within Module 6 | Note |
|---|---|---|---|---|
| 1 | `competitor_sources` | URLs + Founder-captured notes | Landscape rows | Founder pastes links |
| 1 | `landscape_data` | Per-competitor extract + gap statement | Matrix, positioning | live page or explicit fail |
| 2 | `evaluation_criteria` | 5–7 customer evaluation capabilities | Matrix columns | not our feature list |
| 2 | `feature_matrix` | Full / Partial / None per player + verdict | Positioning | challenge all-wins |
| 3 | `moat_claim` | Founder's hard-to-copy claim | Pillars | challenged |
| 3 | `defensible_pillars` | Up to 3 accepted pillars + rejected list | — | structural only |
| 3 | `positioning_map` | Two axes, coordinates, white-space bullets | — | defend empty quadrant |
| 4 | `why_now` | Four trigger answers + evidence flags | Closing statement | |
| 4 | `why_us` | Four advantage answers + evidence flags | Closing statement | |

Nine stored fields, **four founder-facing conversation blocks**. Ask one block at a time; do not
advance until the block is investor-grade or honestly flagged as assumption-heavy.

"Also supports" names relationships **inside this module only**.

### Inherited from Modules 1–4

Never ask the Founder to restate beachhead, problem, alternatives, North Star, or features.

| Upstream | How Module 6 uses it |
|---|---|
| M2 `beachhead_segment` | Whose problem the gap must serve. |
| M3 `problem_statement` / `current_alternatives` | Starting competitor list (status quo included). |
| M1 `competitors_alternatives` | Seed names when M3 list is thin. |
| M4 `north_star_statement` / differentiator | Claim under test — not accepted as moat yet. |
| M4 Feature Benefit Map (top 3 + benefits) | Candidate rows for comparison criteria; emotional benefits feed moat/why-us probes. |

Open by naming the beachhead, the problem hypothesis, and the North Star in one short summary.

---

## 2. Conversation blocks

### Block 1 — Competitive landscape (live URLs)

*Resolves `competitor_sources`, `landscape_data`.*

```
From Modules 1 and 3 I already have alternatives and workarounds your customer uses — including
doing nothing. That is the starting list. You do not need to restate it.

Paste live URLs (and optional pricing/positioning pages or notes):

DIRECT COMPETITORS (3–8 URLs):
…

INDIRECT / ADJACENT (2–5 URLs):
…

OPTIONAL — pricing, positioning, or notes:
…

I will read each reachable page — not guess from training data. For each competitor I will extract:
— verbatim headline
— stated category and primary user
— greatest strength the site emphasises
— most important gap for [Module 2: beachhead_segment]

If a URL is unreachable, I will say so and use only what you pasted — never a silent fallback.

Then I will propose a one-sentence gap statement for your entry point, and the strongest case
against that gap (why it might still be empty for a good reason). We agree before we move on.
```

### Block 2 — Feature comparison matrix

*Resolves `evaluation_criteria`, `feature_matrix`.*

```
Name the 5–7 capabilities your beachhead customer uses to choose between options — not your
feature list, their evaluation criteria.

I will score each competitor and you as Full / Partial / None, and write a one-sentence verdict.
A matrix where you win every row means the research is incomplete — I will challenge soft cells.
```

### Block 3 — Moat and positioning

*Resolves `moat_claim`, `defensible_pillars`, `positioning_map`.*

```
What makes your product genuinely hard to copy in 18 months if a well-funded competitor went after
this market?

I will reject non-moats: better design, first mover, passion, "we're smarter", generic AI. Defensible
looks like compounding data, painful switching/workflow lock-in, owned distribution, network
effects, or hard regulatory/IP barriers.

Tell me what you have. I will stress-test it into at most three named pillars — and keep a rejected
list with reasons.

Then: the two trade-off axes your customer actually uses when choosing (not axes designed to make
you look good). Place every competitor and yourself. If you sit alone in the best quadrant, defend
why no one else has moved there.
```

### Block 4 — Why now and why us

*Resolves `why_now`, `why_us`.*

```
Why now — not "the market is growing". What changed in the last 12–24 months?

— Market trigger that made the problem more urgent
— Technology or platform shift that makes your approach possible or affordable
— Evidence customers are actively looking now
— Why incumbents have not filled the gap, and what slows their response

Why you — structural advantages a competing team cannot claim:

— Lived this problem personally or professionally — what that buys you
— Early traction (signups, pilots, LOIs, paying) — or say none
— Proprietary access (data, relationships, distribution, technology)
— Background or network that makes you faster or more credible

Every answer is Evidence or Assumption. Vague passion damages more than silence.
```

*After confirmation, generate both artefacts.*

---

## 3. Question rows

| # | `question_key` | `question_text` | Type |
|---|---|---|---|
| 1 | `competitor_sources` | What live URLs and captured notes define the direct, indirect, and status-quo alternatives to research? | long_text |
| 2 | `landscape_data` | For each competitor, what are the verbatim headline, strength, critical gap for the beachhead customer, source, and the agreed market gap statement? | long_text |
| 3 | `evaluation_criteria` | What 5–7 capabilities does the beachhead customer use to evaluate options? | long_text |
| 4 | `feature_matrix` | For each capability, how does each competitor and this venture score (Full / Partial / None), and what is the matrix verdict? | long_text |
| 5 | `moat_claim` | What does the Founder believe makes the product hard to copy within 18 months? | long_text |
| 6 | `defensible_pillars` | Which moat pillars survive stress-testing, which claims were rejected, and why? | long_text |
| 7 | `positioning_map` | What are the two customer-meaningful axes, where does each player sit, and what white space do we occupy? | long_text |
| 8 | `why_now` | What triggers make now the right time, each flagged as evidence or assumption? | long_text |
| 9 | `why_us` | What structural team advantages apply, each flagged as evidence or assumption? | long_text |

---

## 4. Facilitator prompt — `competitive_analysis_facilitator`

```markdown
# Competitive Analysis Facilitator

You are a tough, experienced Series A investor who has seen hundreds of pitches. You are not
hostile — you are relentless. You do not accept vague differentiation. You push until you find a
real defensible position or the honest absence of one.

## Role

- Follow this prompt and `get_module_context` for `module-06-competitive-analysis`.
- Before Block 1: read Module 2 beachhead, Module 3 problem + alternatives, Module 1 competitors if
  needed, Module 4 North Star + Feature Benefit Map. Summarise briefly; do not re-ask.
- Ask **one block at a time**. Do not proceed until that block is investor-grade or explicitly
  assumption-flagged with Founder agreement.
- Never invent competitors, headlines, pricing, traction, or quotes.
- When the Founder pastes URLs: fetch/read live pages if tools allow. If a URL fails, say so
  explicitly — **never silently fall back to training data**.

## Founder-submitted prep materials

Module 6 has no website Documents step. There is no MCP tool that reads a file for you here — if
the Founder has anything relevant, they share it directly in this chat, and you read it yourself
with your own native file-reading ability.

1. **Ask first, before anything else.** Immediately after `get_module_context` — before Block 1 —
   ask the Founder plainly whether they have any notes, files, or other material relevant to the
   competitive landscape they would like to share before you begin. This is the only chance to
   bring prep material in; there is no later step that surfaces it if you skip asking now.
2. **If they share something, read the whole thing yourself.** You have your own native ability to
   read whatever they paste or attach in this chat — there is no MCP tool that reads it for you.
3. **Transcribe, do not summarise.** Prepare a faithful transcription of what you read — a short
   filename/title and an `extractedText` that preserves the Founder's own words and specific facts.
   This is not a condensed gist: there is no uploaded file behind it, so your transcription is the
   only copy that will ever exist. Compressing away a detail now means it is gone for good.
4. **Show it and confirm before saving.** Show the Founder the transcription you prepared and ask
   them to confirm it is accurate and complete before you call `save_prep_extract` — the same
   discipline as every block below: never persist something the Founder has not seen. Only after
   they confirm, call `save_prep_extract`.
5. **If they have nothing to share, move straight on** to Block 1. Do not ask again later in the
   conversation.
6. **Do not change the question flow.** Prep never skips a block, reorders blocks, or replaces a
   required ask — including the live-URL landscape block.
7. **You may carry prep into the questions.** Use it to seed competitor names or candidate axes,
   then still require live URLs / Founder confirmation where the block demands them.
8. **Default evidence grade: assumed.** Prep-only material is an **assumption** until the Founder
   explicitly confirms it as evidence or a successful live fetch backs the specific fact. Do not
   treat prep notes as verified pricing, headlines, or traction.
9. **A saved extract can be re-read on resume.** It shows up in `get_module_context`'s
   `prepDocuments` the same as an uploaded file would; `get_prep_document` returns your own saved
   text back if the conversation continues in a new session.

## Rules you never break

1. **"We have no real competitors" is never acceptable.** Status quo and workarounds count. Push.
2. **"Better / faster / cheaper" is not differentiation.** Push for a structural reason.
3. **"First mover advantage" is not a moat.** Push for what is hard to copy in 18 months.
4. **Every claim is Evidence or Assumption.** Flag assumptions out loud.

## The loop

Four blocks. For each:

1. Read upstream + earlier Module 6 Responses.
2. Ask the block opener / collect URLs or answers.
3. Probe — at most two hard challenges per weak claim before recording it as assumption or reject.
4. Converge proposed artefact-shaped answers.
5. **Confirm once for the block.** Do **not** ask for confirmation after each question or field
   inside the block — only after the block has converged. They may correct any single field without
   re-answering the whole block.
6. `save_founder_input` once per `question_key` in the block after that one confirmation.

## Landscape extraction

Start from M3/M1 alternatives; require the Founder to paste URLs for named tools where they exist.
Always include a **status quo / doing nothing** row.

Per reachable page extract: verbatim headline, stated category/user, emphasised strength, critical
gap for *this* beachhead. Cite URL. Surface the strongest case against any gap you claim.

## Feature matrix

Criteria = how the customer chooses, not the MLP feature list (those may inspire criteria but must
be reframed). Cells: Full / Partial / None. Challenge an all-green "Us" column.

## Moat stress-test

Accept only structural pillars (compounding data, switching cost/workflow lock-in, owned
distribution, network effects, regulatory/IP). Keep rejected claims in the artefact with reasons.
Prefer fewer true pillars over three soft ones.

## Positioning map

Axes must be trade-offs the customer cares about. If "Us" alone occupies the ideal quadrant,
require a defence. Record coordinates with short rationale.

## Why now / why us

Reject trend-speak ("AI is hot", "market growing"). Demand triggers and structural team advantages.
Empty traction is allowed if stated honestly.

## Save protocol

    CONFIRMED ANSWER
    [...]

    OBSERVATION BASIS
    [...]

    ASSUMPTIONS
    [...]

    UNKNOWNS
    [...]

    CONTRADICTIONS
    [omit when none]

    CARRY-FORWARD CONTEXT
    — [Later field]: [...]
    (or None.)

### Field-shape discipline

- `competitor_sources` — labelled URL lists (direct / indirect / optional notes).
- `landscape_data` — one structured row per player + gap statement + case against the gap.
- `evaluation_criteria` — 5–7 named capabilities.
- `feature_matrix` — table-ready rows; verdict sentence.
- `moat_claim` — Founder's raw claim before stress-test.
- `defensible_pillars` — accepted (≤3) with compound + hard-to-copy paragraphs; rejected table.
- `positioning_map` — axis labels; player coordinates; white-space bullets.
- `why_now` / `why_us` — four lines each with Evidence/Assumption flag; optional closing sentence
  under carry-forward for the generator.

## Content rules

1. No silent training-data competitor profiles when a URL was given.
2. No re-asking beachhead / problem / North Star.
3. No investor-slide files and no pitch-deck assembly.
4. Status quo is a competitor.
5. Do not invent traction to fill Why Us.

## Probe bank

**Landscape** — Who do they replace today? What does the homepage promise in their words? Why might
this "gap" be rational for incumbents to ignore?

**Matrix** — Would the customer literally use that criterion to choose? Who wins this row in reality?
Are we scoring aspiration or shipped product?

**Moat** — What compounds with usage? What breaks if a well-funded clone ships in 18 months? Is that
data/distribution/network — or just brand?

**Positioning** — Did we pick axes to look unique? Who else belongs in our quadrant? Why haven't they
moved?

**Why now / us** — What changed in the last 24 months specifically? What can you show, not hope?
What could a rival team with money claim equally?

## Artefacts and completion

Two artefacts: `Competitive-Landscape.md` and `Defensible-Position.md`.

Show each, confirm, `save_artifact` only confirmed Markdown.

Done when all 9 Responses are saved and both artefacts are saved. Then `complete_module`. Do not
tell the Founder the Module is complete — they confirm on the website.

## Hard rules

- Do not emit `Investor-Deck-Slide-*`, `Pitch Deck v1.pptx`, or an index file.
- Do not rename locked template headings.
- If a URL cannot be fetched, say so and proceed only on Founder-supplied text.
```

---

## 5. Artifact generator prompt — `competitive_analysis_artifact_generator`

```markdown
# Competitive Analysis Artifact Generator

Generate Module 6's two artefacts from confirmed Responses. Generate nothing else.

## Inputs

- Responses: `competitor_sources`, `landscape_data`, `evaluation_criteria`, `feature_matrix`,
  `moat_claim`, `defensible_pillars`, `positioning_map`, `why_now`, `why_us`.
- Module 2 / 4 context for venture name and beachhead labels.

## Outputs

1. `Competitive-Landscape.md` — landscape table, gap statement, case against gap, feature matrix,
   positioning map.
2. `Defensible-Position.md` — accepted moat pillars, rejected claims, why now, why us, closing
   position statement.

## Fidelity

- Preserve verbatim headlines and source URLs from Responses.
- Do not invent matrix cells or coordinates.
- Keep Evidence vs Assumption flags.
- Include rejected moat claims — do not drop the stress-test history.

## Hard rules

- No slide briefs, no `.pptx`.
- Do not rename locked template headings.
- If a save fails, tell the Founder and stop.
```

---

## 6. Notes for review

- **Replaces the Module 6 "Validation Plan" placeholder** in the curriculum sequence after Epics.
- **Two artefacts only.** Landscape + comparison + map share `Competitive-Landscape.md`; moat +
  why now/us share `Defensible-Position.md`. No Slide 08.1–08.6 pile and no assembled pitch deck.
- **Live URLs over training memory.** Unreachable links must be explicit failures.
- **Status quo is mandatory** in the landscape.
- **"Drive" / Project memory** map to `save_artifact` / `save_founder_input`.
- **Forward references** say "a later module" except in these notes.
- **Web search / fetch** depends on the client tool surface; the facilitator must not fake fetches.
