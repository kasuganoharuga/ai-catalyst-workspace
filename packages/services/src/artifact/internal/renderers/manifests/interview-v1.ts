// Field manifest for problem_interview_workbook_v1 — single source for buildPlan and PDF asserts.
// Capacities derived from pdf/metrics linePitch with 15% headroom for viewer variance.
import type { FieldManifest } from "../types.js";

// Each interview spans pages A (conversation) and B (evidence/assessment).
export const PROBLEM_INTERVIEW_FIELD_MANIFEST_V1: FieldManifest = {
  sectionPrefix: "interview",
  // Founder-chosen at download (5–10); not derivable from Markdown.
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
      // Always 5 — parse/interview-guide.ts enforces exactly five questions.
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
      // 3–4 from confirmed Pass Bar conditions — never an empty 4th when guide has three.
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
      // Always 2 — Module 3 Kill Criteria section is fixed at two patterns.
      count: { kind: "fixed", value: 2 },
    },
    { kind: "fixed", type: "text", suffix: "evidence_extracts", capacity: 400 },
  ],
};
