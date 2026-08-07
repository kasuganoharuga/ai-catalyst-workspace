// buildPlan for validation_roadmap_workbook_v1: turns a confirmed
// ValidationRoadmapModel into a WorkbookRenderPlan. See
// interview-workbook-plan.ts's header for the shared architecture note —
// this file is that renderer's counterpart, with its own content and
// ordering built on the same LayoutBuilder engine.
import { BOLD_FONTKIT_FONT, REGULAR_FONTKIT_FONT } from "@ai-catalyst/services/artifact/internal/renderers/pdf/embed-fonts";
import { LayoutBuilder } from "@ai-catalyst/services/artifact/internal/renderers/pdf/layout-builder";
import { resolveSectionCount } from "@ai-catalyst/services/artifact/internal/renderers/manifest-fields";
import { VALIDATION_ROADMAP_FIELD_MANIFEST_V1 } from "@ai-catalyst/services/artifact/internal/renderers/manifests/roadmap-v1";
import { assertAllPresent, assertFooterOnEveryPage, assertNoPlaceholderText } from "@ai-catalyst/services/artifact/internal/renderers/plan/shared-assertions";
import type { Experiment, ValidationRoadmapModel } from "../parse/validation-roadmap.js";
import type { Provenance, WorkbookRenderPlan } from "../types.js";

const MUTED = { r: 0.42, g: 0.42, b: 0.46 };

function sectionHeading(layout: LayoutBuilder, role: string, text: string, size = 15): void {
  layout.ensure(size * 2);
  layout.lockedText(role, text, { size, bold: true }, { gap: 6 });
}

function labelLine(layout: LayoutBuilder, text: string, x?: number): void {
  layout.ensure(11);
  layout.lockedText(`chrome.label.${text}`, text.toUpperCase(), { size: 6, bold: true, color: MUTED }, {
    x: x ?? layout.margin,
    gap: 0,
  });
  layout.advance(-layout.linePitch(6) + 4);
}

function criterionLine(layout: LayoutBuilder, role: string, label: string, value: string): void {
  layout.lockedText(role, `${label}: ${value}`, { size: 8.5 }, { gap: 4 });
}

function coverPage(layout: LayoutBuilder, model: ValidationRoadmapModel): void {
  layout.setFooterLabel("Cover");
  sectionHeading(layout, "cover.venture_name", model.ventureName, 26);

  sectionHeading(layout, "cover.constraints_heading", "Constraints");
  criterionLine(layout, "cover.time_available", "Time available", model.constraints.timeAvailable);
  criterionLine(layout, "cover.budget", "Budget", model.constraints.budget);
  criterionLine(layout, "cover.customer_access", "Customer access", model.constraints.customerAccess);

  sectionHeading(layout, "cover.what_these_experiments_test_heading", "What these experiments test");
  layout.lockedText("cover.what_these_experiments_test", model.whatTheseExperimentsTest, { size: 9 }, { gap: 8 });

  sectionHeading(layout, "cover.experiments_overview_heading", "Experiments overview");
  model.experiments.forEach((experiment, i) => {
    const idx = i + 1;
    layout.lockedText(`cover.experiment_${idx}_name`, `${idx}. ${experiment.name}   (${experiment.window})`, { size: 9, bold: true }, { gap: 2 });
    criterionLine(layout, `cover.experiment_${idx}_claim`, "Claim tested", experiment.claimTested);
    criterionLine(layout, `cover.experiment_${idx}_pass`, "Pass condition", experiment.passCondition);
    criterionLine(layout, `cover.experiment_${idx}_fail`, "Fail condition", experiment.failCondition);
    criterionLine(
      layout,
      `cover.experiment_${idx}_effort`,
      "Time / cost / signal strength",
      `${experiment.time} / ${experiment.cost} / ${experiment.signalStrength}`,
    );
  });

  sectionHeading(layout, "cover.signal_strength_heading", "Expected evidence signal strength");
  model.signalStrengthAnchors.forEach((anchor, i) => {
    layout.lockedText(`cover.signal_strength_anchor_${i + 1}`, anchor, { size: 8.5, color: MUTED }, { gap: 3 });
  });

  sectionHeading(layout, "cover.start_here_heading", "Start Here");
  criterionLine(layout, "cover.start_here_what_to_do", "What to do", model.startHere.whatToDo);
  criterionLine(layout, "cover.start_here_who_to_contact", "Who to contact, and how", model.startHere.whoToContact);
  criterionLine(layout, "cover.start_here_pass", "What counts as a pass", model.startHere.pass);
  criterionLine(layout, "cover.start_here_fail", "What counts as a fail", model.startHere.fail);

  sectionHeading(layout, "cover.how_to_record_results_heading", "How to record results");
  layout.lockedText("cover.how_to_record_results", model.howToRecordResults, { size: 9 }, { gap: 0 });
}

function experimentSection(layout: LayoutBuilder, model: ValidationRoadmapModel, experiment: Experiment, index: number): void {
  const prefix = `experiment_${index}`;
  const title = `Experiment ${index}`;

  // Page A — locked criteria, plus what the Founder does before the result is known
  layout.newPage();
  layout.setFooterLabel(`${title} · A`);
  sectionHeading(layout, `${prefix}.page_a_title`, `${title}: ${experiment.name}`);

  criterionLine(layout, `${prefix}.claim_tested`, "Claim tested", experiment.claimTested);
  criterionLine(layout, `${prefix}.pass_condition`, "Pass condition", experiment.passCondition);
  criterionLine(layout, `${prefix}.fail_condition`, "Fail condition", experiment.failCondition);
  criterionLine(layout, `${prefix}.time`, "Time", experiment.time);
  criterionLine(layout, `${prefix}.cost`, "Cost", experiment.cost);
  criterionLine(layout, `${prefix}.signal_strength`, "Expected evidence signal strength", String(experiment.signalStrength));
  criterionLine(layout, `${prefix}.window`, "30-day window", experiment.window);

  // Only the first experiment carries Start Here's execution guidance — it
  // expands experiment 1, it never authors new criteria for it (plan §5.4).
  if (index === 1) {
    layout.advance(4);
    criterionLine(layout, `${prefix}.start_here_what_to_do`, "What to do", model.startHere.whatToDo);
    criterionLine(layout, `${prefix}.start_here_who_to_contact`, "Who to contact, and how", model.startHere.whoToContact);
  }

  layout.advance(8);
  labelLine(layout, "Participants");
  layout.textField(`${prefix}.participants`, { width: layout.usableWidth, height: 90, multiline: true, capacity: 550, gap: 8 });

  labelLine(layout, "Contact route");
  layout.textField(`${prefix}.contact_route`, { width: layout.usableWidth, height: 70, multiline: true, capacity: 360, gap: 8 });

  labelLine(layout, "Actions completed");
  layout.textField(`${prefix}.actions_completed`, { width: layout.usableWidth, height: 110, multiline: true, capacity: 640, gap: 8 });

  labelLine(layout, "Dates completed");
  layout.textField(`${prefix}.dates_completed`, { width: 200, height: 15, capacity: 60, gap: 0 });

  // Page B — execution and result
  layout.newPage();
  layout.setFooterLabel(`${title} · B`);
  sectionHeading(layout, `${prefix}.page_b_title`, `${title} — result`);

  labelLine(layout, "Observable result");
  layout.textField(`${prefix}.observable_result`, { width: layout.usableWidth, height: 110, multiline: true, capacity: 640, gap: 8 });

  labelLine(layout, "Verbatim evidence");
  layout.textField(`${prefix}.verbatim_evidence`, { width: layout.usableWidth, height: 110, multiline: true, capacity: 640, gap: 8 });

  labelLine(layout, "Contradicting evidence");
  layout.textField(`${prefix}.contradictions`, { width: layout.usableWidth, height: 90, multiline: true, capacity: 550, gap: 8 });

  const halfWidth = (layout.usableWidth - 16) / 2;
  labelLine(layout, "Actual time");
  const timeY = layout.y;
  layout.textFieldAt(`${prefix}.actual_time`, { x: layout.margin, y: timeY - 15, width: halfWidth, height: 15 }, 40);
  layout.y = timeY;
  labelLine(layout, "Actual cost", layout.margin + halfWidth + 16);
  layout.y = timeY;
  layout.textFieldAt(`${prefix}.actual_cost`, { x: layout.margin + halfWidth + 16, y: timeY - 15, width: halfWidth, height: 15 }, 40);
  layout.advance(15 + 8);

  labelLine(layout, "Outcome");
  layout.dropdownAt(`${prefix}.outcome`, { x: layout.margin, y: layout.y - 18, width: 200, height: 18 }, [
    "Pass",
    "Fail",
    "Inconclusive",
  ]);
  layout.advance(18 + 8);

  labelLine(layout, "Effect on evidence maturity");
  layout.textField(`${prefix}.maturity_impact`, { width: layout.usableWidth, height: 70, multiline: true, capacity: 360, gap: 8 });

  labelLine(layout, "Decision");
  layout.dropdownAt(`${prefix}.decision`, { x: layout.margin, y: layout.y - 18, width: 200, height: 18 }, [
    "Continue",
    "Revise",
    "Stop",
  ]);
  layout.advance(18 + 8);

  labelLine(layout, "Next action");
  layout.textField(`${prefix}.next_action`, { width: layout.usableWidth, height: 90, multiline: true, capacity: 550, gap: 0 });
}

export function buildValidationRoadmapPlan(
  model: ValidationRoadmapModel,
  provenance: Provenance,
): WorkbookRenderPlan {
  // Section count is fully determined by the confirmed Markdown's
  // experiment count (2 or 3) — never a Founder choice, unlike the
  // interview workbook's section count.
  resolveSectionCount(VALIDATION_ROADMAP_FIELD_MANIFEST_V1, model.experiments.length);

  const layout = new LayoutBuilder(REGULAR_FONTKIT_FONT, BOLD_FONTKIT_FONT);
  coverPage(layout, model);
  model.experiments.forEach((experiment, i) => experimentSection(layout, model, experiment, i + 1));

  const { pages, fields, lockedContent, rects } = layout.toPlanParts();
  return { pages, fields, lockedContent, rects, provenance };
}

/**
 * The only place content equality between the confirmed ValidationRoadmapModel
 * and the plan is checked (see interview-workbook-plan.ts's header for the
 * shared rationale). Every experiment's criteria, the shared constraints and
 * signal-strength anchors, and Start Here's guidance must all survive into
 * the plan verbatim.
 */
export function assertValidationRoadmapPlan(plan: WorkbookRenderPlan, model: ValidationRoadmapModel): void {
  assertFooterOnEveryPage(plan);
  assertNoPlaceholderText(plan);

  assertAllPresent(plan, [model.ventureName], "venture name");
  assertAllPresent(
    plan,
    [model.constraints.timeAvailable, model.constraints.budget, model.constraints.customerAccess],
    "constraint",
  );
  assertAllPresent(plan, [model.whatTheseExperimentsTest], "what-these-experiments-test");
  assertAllPresent(plan, model.signalStrengthAnchors, "signal strength anchor");
  assertAllPresent(plan, [model.howToRecordResults], "how-to-record-results");
  assertAllPresent(
    plan,
    [model.startHere.whatToDo, model.startHere.whoToContact, model.startHere.pass, model.startHere.fail],
    "Start Here field",
  );

  for (const experiment of model.experiments) {
    assertAllPresent(
      plan,
      [
        experiment.name,
        experiment.claimTested,
        experiment.passCondition,
        experiment.failCondition,
        experiment.time,
        experiment.cost,
        experiment.window,
      ],
      `experiment "${experiment.name}" field`,
    );
  }
}
