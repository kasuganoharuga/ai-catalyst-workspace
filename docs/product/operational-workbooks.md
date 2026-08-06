# Operational Workbooks — canonical Markdown to editable DOCX

**Document status:** Draft for product and engineering alignment
**Version:** 1.0 — architecture locked, renderers not yet built (2026-08-06)
**Applies to:** Module 3 — Problem Statement & Five Whys; Module 4 — Evidence of Unmet Need

---

**Provenance note:** This is the tracked specification for the workbook layer. No code implements it
yet. Every `rendererKey` in `packages/services/src/content-seed/content/` stays `null` until the
renderer registry, the drift tests and the download route all exist — the same discipline
`validatorKey` follows, and for the same reason: `resolveValidator` throws
`INTERNAL_INVARIANT_ERROR` for a key no deployed code registers, so seeding one early breaks the
save path rather than degrading quietly.

---

## 1. The two kinds of artefact

Founders do not read or fill Markdown. But Markdown is what every downstream module reads. Both
things are true, and the resolution is that some artefacts are records and some are instruments.

| | Canonical Artifact | Operational Workbook |
|---|---|---|
| **What it is** | The system's record | The Founder's tool |
| **Format** | Markdown, in S3 | DOCX, generated on request |
| **Stored?** | Yes — versioned, hashed, validated, confirmed | **No** — built at download, streamed, discarded |
| **Read by** | Later modules and the AI | A person, with a pen or a keyboard |
| **Changes when** | The Founder revises and re-confirms | Never — it is derived |

A Workbook is **an operational expansion of a Canonical Artifact, not another version of it.**
Downloading, filling or editing a Workbook has no effect on the Artifact. Nothing about the Workbook
enters `artifact_versions`.

### Classification

Every artefact in the table below is a Canonical Artifact — a confirmed Markdown record in S3. The
"Has a workbook" column says whether that record can *also* be rendered on demand as an operational
DOCX. The Markdown never stops being the record; the DOCX is the instrument.

| Artefact | Has a workbook | `rendererKey` | Founder's default action |
|---|---|---|---|
| `Problem-Statement.md` | No — read, not worked in | `null` | View online / download source |
| `Problem-Interview-Guide.md` | Yes | `problem_interview_workbook_v1` | Download editable workbook |
| `Evidence-Of-Unmet-Need.md` | No — read, not worked in | `null` | View online / download source |
| `Validation-Roadmap-30-Day.md` | Yes | `validation_roadmap_workbook_v1` | Download editable workbook |

Renderer keys are artefact-specific because **this is not format conversion.** A generic `docx_v1`
would imply a Markdown-to-Word converter; what these renderers do is expand one record into a
different document with a different structure. See §4.

### UI

Where an artefact has a renderer, the primary action is `Download editable workbook (.docx)` and the
Markdown moves to a secondary menu as `Download source (.md)`. The Founder never has to understand
Markdown; the system never stops treating it as the truth.

---

## 2. Why not the AI client

A Founder can always ask their assistant to convert a downloaded file, and that stays available. It
is not the product path.

```
Confirmed Markdown in S3
        ↓
Download editable version
        ↓
resolveRenderer(rendererKey)
        ↓
validate required Markdown sections
        ↓
build DOCX deterministically
        ↓
stream DOCX to the Founder
```

- Identical layout every time, for every Founder.
- No need to reopen a conversation weeks after finishing the module.
- No dependence on how a model interprets layout on the day.
- No prompt, no tokens, no model failure mode.
- Testable.
- Re-downloading after a revision produces the current version automatically.
- Nothing in S3 can fall out of sync, because nothing extra is in S3.

### Download interface

`rendererKey` decides **whether a workbook can be built and by which renderer**. It must never make
the Markdown unreachable — the record has to stay downloadable for the Founder, for admins, and for
support.

```
GET /artifacts/{artifactKey}/download?format=source
GET /artifacts/{artifactKey}/download?format=workbook
```

**`format=source`** — read the Artifact from S3, return `text/markdown`, filename from
`requiredFilename`. Works for every artefact, renderer or not. This is today's behaviour.

**`format=workbook`** — read the Markdown, check `rendererKey`, `resolveRenderer(rendererKey)`,
validate the required sections, build the DOCX in memory, return it with the Word MIME type. Never
written back to S3.

`format=workbook` fails explicitly, and never falls back to Markdown, when:

- `rendererKey` is `null`;
- the registry has no such key; or
- the Markdown is missing a required section.

Silently returning a `.md` to someone who asked for a workbook is worse than an error: they get a
file they cannot use and no signal that anything is wrong. Same discipline as `validatorKey`.

The current route already resolves the artefact with Founder auth and streams Markdown, so this is a
format parameter on
[an existing route](../../apps/web/app/(app)/artefacts/[moduleKey]/[artifactKey]/download/route.ts),
not a new one. Decide the default for a bare `/download` with no `format` before implementing —
keeping it `source` preserves existing links.

---

## 3. The constraint that matters most

**A Workbook's field structure must match the intake structure of the module that consumes its
results.**

This is the one decision that cannot be retrofitted. Everything else — fonts, spacing, page breaks —
can change later at no cost.

The Interview Workbook is filled in during five customer conversations and then brought into the
next module, whose intake wants, per interview: who the person was, whether they match the beachhead,
the verbatim quotes, which pass-bar conditions were met, and any contradicting evidence. If the
Workbook is laid out to that shape, the Founder pastes the whole thing in and the receiving module
gets structured input. If it is laid out to look tidy, the Founder pastes in five conversations
merged into prose, and every rule that module carries — quote verbatim, do not summarise before
saving, count people not rows — has to be enforced by the model against material that no longer
supports it.

**Design the Workbook backwards from the next module's intake, not forwards from the Markdown.**

---

## 4. Workbook structures

### `problem_interview_workbook_v1`

Source: `Problem-Interview-Guide.md`.

**Part 1 — Interview Round Overview** (one page, reference material, not filled)

Venture · Interview Target · What This Interview Tests · the five questions · Mom Test Rules ·
Pass Bar · Kill Criteria.

**Part 2 — five Interview Sections**, generated identically, one per conversation. "Section", not
"sheet" — DOCX has no sheets, and the receiving module keys on the section headings.

Header fields: date · participant identifier · role and organisation · how they match the beachhead
customer · where they were recruited · interview channel.

Then the five questions, each with room to write.

Then, per section:

- Verbatim customer quotes
- Observed behaviour
- Existing workaround
- Money or time already spent
- Contradicting evidence
- Pass Bar checklist
- Kill Criteria observed
- Does this interview meet the bar?
- Evidence-bearing extracts to take into the next module

**Part 3 — Additional Interview Section**, one blank copy for a sixth conversation.

Five sections are generated regardless of how many interviews happen. The pass bar is 3 of 5; five
is the complete round. The Additional section takes index 6 (`interview_6.*`); fixed tags mean
exactly one extra section in this version, and supporting an arbitrary number would need a different
tagging scheme.

### `validation_roadmap_workbook_v1`

Source: `Validation-Roadmap-30-Day.md`.

**Page 1 — 30-Day Overview:** Constraints · claims being tested · experiment overview · the 30-day
schedule.

**One page per experiment**, pre-filled *only* from fields explicitly present in the confirmed
Markdown.

Pre-filled for every experiment: experiment · claim tested · scheduled window · time · cost ·
expected evidence signal strength · pre-set pass condition · pre-set fail condition.

For the first experiment only, also `What to do` and `Who to contact, and how`, from Start Here.

To be filled in: participants · contact route · actions completed · observable result · verbatim
evidence · contradicting evidence · Pass / Fail / Inconclusive · effect on evidence maturity ·
decision (continue / revise / stop) · next action.

**The renderer never infers a missing field.** The roadmap template records a target and an access
route only for the first experiment, so experiments 2 and 3 leave those operational fields blank.
Do not synthesise participants, channels or access routes for later experiments — if they should
carry their own target, add the field to the Markdown template first. `Why this experiment` is
deliberately absent: `Claim tested` and `What These Experiments Test` already carry it.

The record holds two or three experiments, so the Workbook has two or three experiment pages. It
never renders a blank page for an experiment that does not exist.

### Protected workbook rules

A Workbook is editable **only inside named input controls.** Everything derived from the confirmed
Markdown is locked against accidental editing.

The renderer must:

1. place every Founder-editable field inside a uniquely tagged Word content control;
2. keep headings, questions, hypotheses, pass conditions, fail conditions and scoring criteria
   outside editable controls;
3. enable document protection in forms-only mode;
4. validate that every expected editable tag exists exactly once;
5. validate that all source-derived locked text matches the confirmed Markdown; and
6. fail rendering rather than return an unprotected or partially generated workbook.

Document protection prevents accidental structural edits. **It is a workflow and usability control,
not encryption and not a security boundary** — a determined Founder can remove it, and that is
acceptable. What it prevents is the accident: overwriting a question mid-interview, or nudging a
pass condition while typing next to it.

The pass and fail conditions matter most. They are pre-set precisely so they cannot move after the
result is known; leaving them editable in the document the Founder fills in while looking at the
result would undo the discipline the whole roadmap is built on.

#### Content control tags

Tags are stable, lowercase, dot-separated, and numbered per repeated unit. Same field structure
across all five interview sections and all experiment pages — only the index changes. The Additional
Interview Section is index 6.

```
interview_1.participant            experiment_1.participants
interview_1.beachhead_match        experiment_1.contact_route
interview_1.question_1_notes       experiment_1.actions_completed
interview_1.verbatim_quotes        experiment_1.observable_result
interview_1.observed_behaviour     experiment_1.verbatim_evidence
interview_1.contradictions         experiment_1.contradictions
interview_1.pass_bar_1             experiment_1.outcome
interview_1.overall_result         experiment_1.maturity_impact
                                   experiment_1.decision
                                   experiment_1.next_action
```

Tags are the round-trip contract. When direct upload of a filled Workbook is added later, they are
how its contents map back to fields without re-parsing prose.

#### Locked and editable, per workbook

**`problem_interview_workbook_v1`**

*Locked:* Venture · Interview Target · What This Interview Tests · the five questions · Mom Test
Rules · Pass Bar · Kill Criteria · every fixed field label.

*Editable:* interview date · participant identifier · role and organisation · recruitment channel ·
beachhead match · notes against each of the five questions · verbatim quotes · observed behaviour ·
existing workaround · money or time spent · contradicting evidence · Pass Bar checkboxes · Kill
Criteria observed · interview result · evidence-bearing extracts.

**`validation_roadmap_workbook_v1`**

*Locked:* Constraints · claims being tested · experiment name · claim tested · scheduled window ·
time · cost · expected evidence signal strength · **pass condition** · **fail condition**.

*Editable:* participants · contact route · actions completed · observable result · verbatim
evidence · contradicting evidence · Pass / Fail / Inconclusive · effect on evidence maturity ·
continue / revise / stop · next action.

### Print and compatibility

Beyond the controls, keep the document plain: headings, tables with empty cells, ruled blank
paragraphs, checkbox characters. It has to render in Word, survive import into Google Docs, behave
in LibreOffice, and print for handwriting.

Call these **editable and printable** workbooks rather than "fillable" in Founder-facing copy —
"fillable" reads as a form to complete online, and the common case is printing it or typing into it
in Word.

---

## 5. Renderer registry

Mirrors `artifact/internal/validators/`:

```
packages/services/src/artifact/internal/renderers/
  registry.ts
  problem-interview-workbook-v1.ts
  validation-roadmap-workbook-v1.ts
```

Each renderer declares at minimum:

```
{ key, mimeType, extension, downloadFilename, requiredSections, render }
```

`requiredSections` is the contract with the Markdown template.

`requiredSections` is **every locked heading in the template, `##` and `###` alike** — not only the
top level. A subheading left out is a subheading the renderer may silently drop when it is renamed.

- `problem_interview_workbook_v1` requires: Venture · Interview Target · What This Interview Tests ·
  Five Interview Questions · Mom Test Rules · Pass Bar · Kill Criteria · After Each Call ·
  Where Results Go. *(All `##`; this template has no `###`.)*
- `validation_roadmap_workbook_v1` requires: Venture · Constraints · What These Experiments Test ·
  Experiments · **Expected evidence signal strength** *(`###`)* · Start Here ·
  How to Record Results.

A section left out of `requiredSections` is a section the renderer may silently drop. Three were
nearly omitted while writing this document — After Each Call and Where Results Go, which are the
note-taking discipline and the handoff instruction a Founder needs on the page mid-interview, and
Expected evidence signal strength, which is the scoring anchor set. All three were caught by
comparing the list against the real templates, which is exactly the check §6 makes permanent.

A missing heading throws `INTERNAL_INVARIANT_ERROR`. It never renders a Word file with a section
silently absent — a Founder discovering mid-interview that the Pass Bar page is blank is worse than
a failed download.

**No fallback.** When `rendererKey` is non-null but the registry has no such key, that is an internal
configuration error. Do not serve the Markdown instead, and do not build a generic Word document.
Same rule as `validatorKey`.

---

## 6. Drift protection

Required in the first version, not deferred. The Markdown templates changed roughly ten times during
authoring; a renderer coupled to them by nothing but good intentions will go stale silently.

**Heading contract test.** Read the real template Markdown, compare its locked headings against each
renderer's `requiredSections`. Renaming a heading without updating the renderer must fail the build.
This is the same check already applied by hand between the templates and the generator prompts'
section→source mapping tables.

**Output validation.** Producing a `.docx` Buffer is not evidence that the Workbook is correct. Each
renderer asserts against its own output before returning it, and fails rather than shipping a
partial or unprotected file.

*Interview Workbook*

- exactly five Interview Sections, plus the one Additional Interview Section;
- five questions in every section, matching the Markdown verbatim;
- Pass Bar matching the Markdown;
- beachhead-match, verbatim-quotes and contradictions fields present in every section;
- every content control tag present exactly once;
- no source-derived fixed text sitting inside an editable control;
- document protection enabled.

*Roadmap Workbook*

- one experiment page per experiment in the Markdown, two or three, and no blank page;
- every page carries pass, fail, window, time and cost, each matching the Markdown exactly;
- experiment 1 agrees with Start Here;
- every page has its result-recording fields;
- pass and fail are not editable;
- document protection enabled.

---

## 7. Provenance

Every generated file records, in a footer or document properties: source artifact ID · source
artifact version · source SHA-256 · renderer key · generated-at timestamp.

```
Generated from Problem-Interview-Guide.md
Artifact version: 3
Renderer: problem_interview_workbook_v1
```

A Founder returning weeks later with a filled Workbook needs to know which version of the guide it
came from — particularly if the Artifact has been revised since.

Download filenames differ from the Artifact filenames:

- `Problem-Interview-Workbook.docx`
- `Validation-Roadmap-30-Day-Workbook.docx`

These are transient operational files, so distinct names do not breach the one-artefact-per-record
rule.

---

## 8. What happens to a filled Workbook

A filled Workbook never overwrites the Markdown and never becomes a new artifact version.

```
Problem-Interview-Guide.md
        ↓ generate
Problem-Interview-Workbook.docx
        ↓ Founder fills it in during five conversations
interview evidence
        ↓
the next module's evidence intake
```

```
Validation-Roadmap-30-Day.md
        ↓ generate
Validation-Roadmap-30-Day-Workbook.docx
        ↓ Founder runs the experiments and records results
experiment results
        ↓
later review / solution-validation input
```

Module 3 explicitly does not read interview results; the module after it does. The filled Workbook
is therefore input to the *next* stage, not a revision of the artefact that produced it.

Today the filled Workbook reaches the platform by the Founder attaching or pasting it into the AI
conversation — the client extracts the text, and the receiving module persists evidence-bearing
extracts through `save_founder_input`. If direct upload is added later, a filled Workbook must be
stored as an **evidence attachment** or an **experiment result submission**, never as an
`artifact_version`.

---

## 9. Implementation order

Architecture is locked now; the renderers are not built now.

1. Confirm the record / instrument classification in the Artifact Definitions (§1).
2. Keep every `rendererKey` at `null` until the registry, the tests and the download route exist.
3. Seed Modules 3 and 4.
4. Run one complete Founder case end to end.
5. Finalise the two Workbooks' fields and spacing from what that case actually produced.
6. Build `problem_interview_workbook_v1`.
7. Validate it with a real filled round taken back into the next module.
8. Build `validation_roadmap_workbook_v1`.

Steps 4 and 5 are in that order deliberately. Only a real run shows how a Founder actually fills five
interview sections, and that is the single thing this document has to get right.

---

## 10. Open items

- **Content controls and protection may decide the generation strategy — resolve this first.** §1
  chose programmatic generation over a binary `.docx` template, on the grounds that the expansion
  logic (five interview sections, one page per experiment) is code and a binary file cannot be reviewed in a
  content repo. The protection requirements pull the other way: Word content controls (`w:sdt`) and
  forms-mode `w:documentProtection` are not first-class in the common pure-JS builders, whereas a
  template authored in Word already carries both and a template-filling library injects by tag.
  Neither option is obviously right — programmatic means possibly hand-emitting OOXML for the
  controls; template-filling means a binary artefact in the repo and looping constructs for the
  expansion. **Spike both against the real requirements before writing either renderer.** This is
  now the largest unresolved decision in this document.
- **Dependency must be pure JavaScript.** `apps/web/scripts/verify-standalone-build.mjs` asserts the
  Next.js standalone traced file list. A renderer pulling a native binary (pandoc, LibreOffice) would
  break that check and inflate the deployment. Run the script against the chosen library before
  committing to it.
- **Where the renderer runs.** The registry lives in `packages/services`, but the download route is
  in `apps/web`. `.dependency-cruiser.js` governs what may import what; confirm the layering before
  the first renderer lands.
- **Conversion cost at download.** Building a DOCX is not free. Measure it once a renderer exists; if
  it is material, the answer is a response cache keyed on artifact version and SHA — never a stored
  object.
