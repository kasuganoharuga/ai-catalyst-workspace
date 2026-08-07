// Field manifest for validation_roadmap_workbook_v1 — see the
// operational-workbooks plan §5.4. Capacities derived by the same method as
// interview-v1.ts's (real linePitch, worst-case content, 15% safety
// margin) — see this repo's derivation history for interview-v1.ts's fuller
// note on why the formula matters.
import type { FieldManifest } from "../types.js";

// Each experiment spans two pages: A (locked criteria plus what the
// Founder does before the result is known) and B (execution and result,
// filled in after). Never a page for an experiment that does not exist —
// sectionCount is driven entirely by the confirmed Markdown's experiment
// count (2 or 3), never a Founder choice.
export const VALIDATION_ROADMAP_FIELD_MANIFEST_V1: FieldManifest = {
  sectionPrefix: "experiment",
  sectionCount: { kind: "fromModel", source: "experiments", minimum: 2, maximum: 3 },
  fields: [
    // Page A — before the result is known
    { kind: "fixed", type: "text", suffix: "participants", capacity: 550 },
    { kind: "fixed", type: "text", suffix: "contact_route", capacity: 360 },
    { kind: "fixed", type: "text", suffix: "actions_completed", capacity: 640 },
    { kind: "fixed", type: "text", suffix: "dates_completed", capacity: 60 },

    // Page B — execution and result
    { kind: "fixed", type: "text", suffix: "observable_result", capacity: 640 },
    { kind: "fixed", type: "text", suffix: "verbatim_evidence", capacity: 640 },
    { kind: "fixed", type: "text", suffix: "contradictions", capacity: 550 },
    { kind: "fixed", type: "text", suffix: "actual_time", capacity: 40 },
    { kind: "fixed", type: "text", suffix: "actual_cost", capacity: 40 },
    // Options are renderer chrome from the Module 4 vocabulary, not derived
    // from the Markdown — see plan §5.1's note on why this is not a rule
    // violation despite the "never infer" discipline elsewhere.
    { kind: "fixed", type: "dropdown", suffix: "outcome", options: ["Pass", "Fail", "Inconclusive"] },
    { kind: "fixed", type: "text", suffix: "maturity_impact", capacity: 360 },
    { kind: "fixed", type: "dropdown", suffix: "decision", options: ["Continue", "Revise", "Stop"] },
    { kind: "fixed", type: "text", suffix: "next_action", capacity: 550 },
  ],
};
