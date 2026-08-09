import type { ProgramContent } from "../types.js";

// version_number and version_label are fixed here rather than computed at
// seed time, so a version's identity never depends on what else has been
// created before it.
//
// This is a program_versions row under program_key "founder-toolkit-v1"
// (content revision). It is not a second overall product Program — a future
// product-line V2 would be a new programs.program_key.
//
// versionNumber/versionLabel are meant to stay fixed at 1/"v1" for the
// entire living-V1 period — versionLabel is upsertProgramVersion's lookup
// key, so changing it mid-stream would create a second program_versions
// row instead of reconciling this one. They only move to 2/a new label
// once V1 is frozen (`pnpm db:freeze`) and a genuinely new version starts;
// see freeze-cli.ts's own printed runbook for that sequence. Until then,
// every content edit — including this file's own releaseNotes below —
// lands on this same row via db:seed, because contentLock is "mutable".
//
// This is the changelog for the living V1 row, editable in place — add a
// new entry at the top on every content change from now on, the same way
// a CHANGELOG.md would be updated, rather than writing a new
// program_versions row per edit. It replaces the old per-version
// releaseNotes text v1-v6 each carried (those program_versions rows,
// and the release notes describing them, existed under the old
// "one program_version per content revision" scheme this rollout
// replaces — see infra/database/migrations/0012_content_lock.sql's own
// comments for why).
const V1_CHANGELOG = [
  "## Module 4 QA — source prerequisite, submit set, Evidence PDF, prompt fidelity",
  "interview_evidence is optional for official validators (is_required=false); complete_module still ",
  "requires this Attempt's pinned source_interview_evidence_artifact_id. Submit interviews persists ",
  "evidence_status=submitted before Confirm evidence. evidence_of_unmet_need gains ",
  "evidence_of_unmet_need_html_v1 (HTML→Gotenberg PDF). Facilitator/generator v3: free-text review ",
  "(no Save-as-is), quantitative fidelity, no claim re-strengthening, Level 4 unprompted / Level 5 ",
  "paid-or-binding.",
  "",
  "## Module 4 — website interview evidence, then Claude",
  "Module 3 still prepares the Interview Guide (questions snapshotted at confirm). Module 4 opens ",
  "with website Steps 1–2 (record interviews → confirm Interview-Evidence.md); Continue in Claude ",
  "only after confirm. Claude runs Analyse / Decide / Plan against one pinned evidence snapshot per ",
  "attempt. Printable PDFs (Interview Guide, Verdict, ICA, 30-Day Roadmap) render via HTML→Gotenberg ",
  "(interview_guide_html_v1 / pressure_test_verdict_html_v1 / ideal_customer_avatar_html_v1 / ",
  "validation_roadmap_html_v1). Legacy pdf-lib renderer keys remain registered for in-flight Runs.",
  "",
  "## Ideal Customer Avatar gains a styled PDF export",
  "Module 2's Ideal-Customer-Avatar.md is now also downloadable as an on-demand, never-stored PDF ",
  '("?format=workbook") ported from a Claude Design mockup — a navy masthead, four-column Snapshot ',
  "band, and tiered Buying Signal cards, in place of the plain Markdown. Read-only: there is nothing ",
  "for a Founder to fill in, since Module 2 fully generates this artefact. renderer_key is now ",
  '"ideal_customer_avatar_export_v1". The template\'s internal Validation Status section is still ',
  "rendered (compactly, muted) rather than dropped, per renderer-template-contract.test.ts's reverse ",
  "check.",
  "",
  "## Operational workbooks — Modules 3 and 4 gain a fillable PDF renderer",
  "Problem-Interview-Guide.md and Validation-Roadmap-30-Day.md are now also downloadable as an ",
  'on-demand, never-stored fillable PDF ("?format=workbook") alongside the existing Markdown ',
  "download — a Founder-facing operational copy for the pen-and-paper/typing work these two ",
  "artefacts exist to drive, while the Markdown in storage stays the sole record either module ever ",
  'reads. problem_interview_guide\'s renderer_key is now "problem_interview_workbook_v1" and ',
  "validation_roadmap_30_day's is \"validation_roadmap_workbook_v1\"; every other artefact's ",
  "renderer_key stays null. A filled workbook is never uploaded back and never becomes an artifact ",
  "version. evidence_facilitator gained one clarification alongside this: a workbook's ticked Pass ",
  "Bar/Kill Criteria boxes, if a Founder carries them into Interview-Notes.md, are the Founder's ",
  "contemporaneous observation to weigh against the written notes for that interview — never the ",
  "grading verdict on their own.",
  "",
  "## Living V1 rollout — content_lock becomes 'mutable'",
  "Every prompt/content edit used to require publishing a brand-new program_version, which a Founder ",
  "already mid-Run never saw (program_versions binds at Run creation and never moves — see that column's ",
  "own comment). That meant shipping a fix and having real Founders testing the product were mutually ",
  "exclusive. From this point on, while content_lock='mutable', the content-seed reconciler can edit ",
  "Modules/Questions/Artifact Definitions/Prompts of this already-published program_version in place, and ",
  "every Founder Run's program_run_modules is kept in sync automatically — a missing Module is front-filled, ",
  "a renamed/reordered one is updated, and nothing already unlocked is ever re-locked (see ",
  "workflow/internal/reconcile-run-modules.ts) — the next time getOrCreateProgramRun runs for that Founder. ",
  "`pnpm db:freeze` ends the living period for good and restores the original bound-at-creation semantics for ",
  "whatever version comes after.",
  "",
  "Staging and production were reset (every prior program_version, and every Run/Founder bound to one, was ",
  "wiped — see packages/db/src/reset.ts) rather than migrated in place: collapsing six already-diverged content ",
  "revisions (v1 through v6) into a single living v1 row is not a safe automatic migration.",
  "",
  '## Carried over from the old program_versions v6 ("v6-interview-notes-source-of-truth")',
  "Module 4 previously saved Interview-Notes.md in Block 1 and then graded the rest of the Module from ",
  "`evidence_additions`, which the facilitator itself describes as a deliberately lossy set of extracts — a ",
  "Module resumed in a new chat a week later had no complete copy of the interviews left. v6 inverted that: the ",
  "file is the record, the extracts are an index into it. evidence_facilitator orders the save ahead of every ",
  "Response (readable notes -> normalise -> save_artifact -> confirm success -> save_founder_input), stops the ",
  "Module if that save fails rather than continuing from the conversation copy, requires every later block and ",
  "every resume to re-read the file with get_artifact, and warns that Interview-Notes.md needs this Module's ",
  "own attemptId while Module 3's Problem-Interview-Guide.md needs Module 3's. evidence_artifact_generator reads ",
  "the file back before generating, so quotations come from the record. interview_notes moved to sequence_index ",
  "1 and the two graded outputs to 2 and 3, so sequence order describes when each artefact happens; what a ",
  "Module is summarised by is its first *required* Artifact (apps/web's headlineArtifact), not its first row.",
].join("\n");

export const PROGRAM_CONTENT: ProgramContent = {
  programKey: "founder-toolkit-v1",
  programName: "AI Catalyst Founder Toolkit",
  programDescription:
    "The single V1 Program: a skill-first founder workflow from raw idea to validation-ready plan.",
  versionNumber: 1,
  versionLabel: "v1",
  versionName: "Founder Toolkit V1 (living)",
  versionDescription:
    "The living V1 content set: Modules, Questions, Artifact Definitions, and Prompts evolve in place " +
    "(content_lock='mutable') until V1 is judged complete and frozen. See releaseNotes for the changelog " +
    "of what changed and when.",
  contentLock: "mutable",
  releaseNotes: V1_CHANGELOG,
};
