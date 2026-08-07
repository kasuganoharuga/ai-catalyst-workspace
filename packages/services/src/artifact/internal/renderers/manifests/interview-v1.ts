// Field manifest for problem_interview_workbook_v1 — see the
// operational-workbooks plan §5.1/§5.2. This is the single source of truth
// for every field this renderer produces; buildPlan() and (in commit 4)
// assert-pdf-structure.ts both walk it via ../manifest-fields.ts, so they
// can never independently disagree about what fields should exist.
//
// Capacities were derived from pdf-lib's REAL multiline line pitch
// (pdf/metrics.ts's `linePitch`, verified against pdf-lib's own generated
// appearance streams — see that module's header for the bug an earlier,
// wrong assumption would have caused) by binary-searching the largest
// character count of realistic worst-case content that still fits each
// field's rectangle, then backing off 15% for viewer-rendering variance.
// None of these is a placeholder: every `capacity` here is real and this
// manifest may not ship with `capacity: undefined` or `"spike"` on any
// field (see plan §6, §12).
import type { FieldManifest } from "../types.js";

// Interview sections span two pages: A (the conversation) and B (evidence
// and assessment) — see plan §5.1's note on why this collapsed from an
// earlier three-page design once Pass Bar/Kill Criteria moved to a
// two-column layout.
export const PROBLEM_INTERVIEW_FIELD_MANIFEST_V1: FieldManifest = {
  sectionPrefix: "interview",
  // Founder-chosen at download time (plan §5.2) — NOT derivable from the
  // Markdown, which has no "how many people do you expect to interview"
  // field. ROUND_SIZE (5) stays fixed regardless of this count; see
  // plan/interview-workbook-plan.ts for why sections beyond 5 are titled
  // "Additional interview N" rather than renumbered into the round.
  sectionCount: { kind: "option", minimum: 5, maximum: 10, default: 5 },
  fields: [
    // Page A — the conversation
    { kind: "fixed", type: "text", suffix: "date_day", capacity: 2 },
    { kind: "fixed", type: "text", suffix: "date_month", capacity: 2 },
    { kind: "fixed", type: "text", suffix: "date_year", capacity: 4 },
    { kind: "fixed", type: "text", suffix: "participant", capacity: 30 },
    { kind: "fixed", type: "text", suffix: "role_organisation", capacity: 40 },
    {
      kind: "fixed",
      type: "text",
      suffix: "recruitment_channel",
      capacity: 30,
    },
    { kind: "fixed", type: "text", suffix: "beachhead_match", capacity: 250 },
    {
      kind: "family",
      type: "text",
      suffixTemplate: "question_{n}_notes",
      // Always exactly 5 — the confirmed guide always has exactly 5
      // questions (parse/interview-guide.ts throws otherwise), so this is
      // "fromModel" in spirit but fixed in practice; expressed as fixed
      // because the field count must not silently vary if a future
      // Markdown template relaxed that constraint without this manifest
      // being revisited.
      count: { kind: "fixed", value: 5 },
      capacity: 400,
    },

    // Page B — evidence and assessment
    { kind: "fixed", type: "text", suffix: "verbatim_quotes", capacity: 620 },
    {
      kind: "fixed",
      type: "text",
      suffix: "observed_behaviour",
      capacity: 470,
    },
    {
      kind: "fixed",
      type: "text",
      suffix: "existing_workaround",
      capacity: 170,
    },
    {
      kind: "fixed",
      type: "text",
      suffix: "money_or_time_spent",
      capacity: 170,
    },
    { kind: "fixed", type: "text", suffix: "contradictions", capacity: 470 },
    {
      kind: "family",
      type: "checkbox",
      suffixTemplate: "pass_bar_{n}",
      // 3–4, driven by how many conditions the confirmed Pass Bar actually
      // has (parse/interview-guide.ts's passBar.conditions.length) — never
      // an empty 4th field when the guide has three.
      count: {
        kind: "fromModel",
        source: "passBarConditions",
        minimum: 3,
        maximum: 4,
      },
    },
    {
      kind: "family",
      type: "checkbox",
      suffixTemplate: "kill_criterion_{n}_observed",
      // Always exactly 3 — Module 3's Kill Criteria section is always
      // exactly 3 patterns (parse/interview-guide.ts enforces this).
      count: { kind: "fixed", value: 3 },
    },
    { kind: "fixed", type: "text", suffix: "evidence_extracts", capacity: 400 },
  ],
};
