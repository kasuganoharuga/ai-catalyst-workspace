// buildPlan + assertPlanMatchesModel for problem_interview_workbook_v1.
// buildPlan turns a confirmed InterviewGuideModel into a WorkbookRenderPlan
// using the shared LayoutBuilder engine (pdf/layout-builder.ts) and the
// field manifest (manifests/interview-v1.ts). Produces plan data only — no
// PDF bytes, no live pdf-lib document. See ../types.ts for why that
// separation matters, and that file's header for why assertPlanMatchesModel
// — not a post-render PDF re-parse — is where ALL content equality is
// checked: text drawn into a PDF passes through glyph encoding, subsetting
// and content-stream compression, so there is no reliable string to search
// for in the finished bytes.
import { BOLD_FONTKIT_FONT, REGULAR_FONTKIT_FONT } from "@ai-catalyst/services/artifact/internal/renderers/pdf/embed-fonts";
import { LayoutBuilder } from "@ai-catalyst/services/artifact/internal/renderers/pdf/layout-builder";
import { PROBLEM_INTERVIEW_FIELD_MANIFEST_V1 } from "@ai-catalyst/services/artifact/internal/renderers/manifests/interview-v1";
import { resolveSectionCount } from "@ai-catalyst/services/artifact/internal/renderers/manifest-fields";
import { assertAllPresent, assertFooterOnEveryPage, assertNoPlaceholderText } from "@ai-catalyst/services/artifact/internal/renderers/plan/shared-assertions";
import type { InterviewGuideModel } from "../parse/interview-guide.js";
import type { Provenance, WorkbookRenderPlan } from "../types.js";

const ACCENT = { r: 0.76, g: 0.25, b: 0.05 }; // rust — Kill Criteria and code labels only
const MUTED = { r: 0.42, g: 0.42, b: 0.46 };

// Sections beyond this stay out of "the round" the confirmed Pass Bar
// (3 of 5) is scoped to — see manifests/interview-v1.ts's sectionCount
// comment and plan §5.2. Titled "Additional interview N", never
// renumbered into the round, so the masthead's Pass Bar statistic never
// has to change with a Founder's chosen section count.
const ROUND_SIZE = 5;

// Fixed renderer chrome — not sourced from the Markdown, ships with the
// renderer per plan §5.3, does not wait on any future shortLabel content
// change. Codes are bare (P1/P2/P3, K1/K2/K3) with no summary text: a
// hand-truncated condition risks silently dropping the clause that sets
// the actual bar (plan §5.3's "unprompted, with dates or job numbers
// attached" example), and a renderer cannot know which words are safe to
// drop from a confirmed condition. The full wording lives on the
// reference page; this note says so explicitly.
const OBSERVATION_NOTE =
  "Founder observation only — Module 4 will independently verify this against the written evidence. " +
  "The full wording of every condition is on page 1.";

export interface BuildInterviewWorkbookPlanOptions {
  /** Founder-chosen interview section count, 5-10 — see manifests/interview-v1.ts. Defaults to the manifest's default (5). */
  sectionCount?: number;
}

function labelLine(layout: LayoutBuilder, text: string, x?: number): void {
  layout.ensure(11);
  // Drawn as locked chrome (a field label), not tracked against the model —
  // labels are renderer-authored, not confirmed-Markdown content.
  layout.lockedText(`chrome.label.${text}`, text.toUpperCase(), { size: 6, bold: true, color: MUTED }, {
    x: x ?? layout.margin,
    gap: 0,
  });
  layout.advance(-layout.linePitch(6) + 4); // tight gap between a label and the field beneath it
}

function sectionHeading(layout: LayoutBuilder, role: string, text: string): void {
  layout.ensure(28);
  layout.lockedText(role, text, { size: 15, bold: true }, { gap: 6 });
}

function twoColumnCheckboxes(
  layout: LayoutBuilder,
  sectionIndex: number,
  passBarCount: number,
): void {
  const gutter = 22;
  const colWidth = (layout.usableWidth - gutter) / 2;
  const rightX = layout.margin + colWidth + gutter;
  const rowsNeeded = Math.max(passBarCount, 3);
  layout.ensure(rowsNeeded * 16 + 24);

  const top = layout.y;
  sectionHeading(layout, `interview_${sectionIndex}.pass_bar_heading`, "Pass Bar observed");
  const afterLeftHeading = layout.y;
  layout.y = top;
  layout.lockedText(
    `interview_${sectionIndex}.kill_criteria_heading`,
    "Kill Criteria observed",
    { size: 15, bold: true, color: ACCENT },
    { x: rightX, gap: 6 },
  );
  layout.y = Math.min(afterLeftHeading, layout.y);

  const rowsTop = layout.y;
  const boxSize = 10;
  // Row pitch is boxSize plus clearance, not boxSize alone: pdf-lib's
  // checkbox widgets report a rectangle inflated by their border width
  // (confirmed: a requested 10x10 box with borderWidth 0.8 reads back as
  // 10.8x10.8 once rendered), so packing rows at exactly boxSize apart
  // leaves adjacent checkboxes' borders overlapping by a fraction of a
  // point.
  const rowPitch = boxSize + 3;

  for (let i = 0; i < passBarCount; i += 1) {
    const boxY = rowsTop - i * rowPitch - boxSize;
    layout.checkboxAt(`interview_${sectionIndex}.pass_bar_${i + 1}`, {
      x: layout.margin,
      y: boxY,
      width: boxSize,
      height: boxSize,
    });
    // Explicit `y: boxY + ...`, not the auto-advancing cursor, so the code
    // label lands exactly beside its own checkbox rather than wherever
    // `layout.y` happened to be left over from a previous placement.
    // lockedText's `y` is the top of the text block (render subtracts the
    // font size to get the first baseline) — to land the baseline near
    // boxY + 2 (roughly centred against a ~10pt checkbox, verified against
    // the actual rendered Tm y-values), y must be baseline + size.
    layout.lockedText(
      `interview_${sectionIndex}.pass_bar_${i + 1}_code`,
      `P${i + 1}`,
      { size: 8, bold: true, color: ACCENT },
      { x: layout.margin + boxSize + 6, y: boxY + 2 + 8 },
    );
  }
  const leftBottom = rowsTop - (passBarCount - 1) * rowPitch - boxSize;

  for (let i = 0; i < 3; i += 1) {
    const boxY = rowsTop - i * rowPitch - boxSize;
    layout.checkboxAt(`interview_${sectionIndex}.kill_criterion_${i + 1}_observed`, {
      x: rightX,
      y: boxY,
      width: boxSize,
      height: boxSize,
    });
    layout.lockedText(
      `interview_${sectionIndex}.kill_criterion_${i + 1}_code`,
      `K${i + 1}`,
      { size: 8, bold: true, color: ACCENT },
      { x: rightX + boxSize + 6, y: boxY + 2 + 8 },
    );
  }
  const rightBottom = rowsTop - 2 * rowPitch - boxSize;

  layout.y = Math.min(leftBottom, rightBottom) - 6;
}

function referencePage(layout: LayoutBuilder, model: InterviewGuideModel, sectionCount: number): void {
  layout.setFooterLabel("Reference");
  sectionHeading(layout, "reference.venture_name", model.ventureName);

  sectionHeading(layout, "reference.interview_target_heading", "Interview target");
  layout.lockedText("reference.interview_target", model.interviewTarget, { size: 9 }, { gap: 8 });

  sectionHeading(layout, "reference.what_this_tests_heading", "What this interview tests");
  layout.lockedText("reference.what_this_tests", model.whatThisInterviewTests, { size: 9 }, { gap: 8 });

  sectionHeading(layout, "reference.questions_heading", "The five questions");
  model.questions.forEach((question, i) => {
    layout.lockedText(`reference.question_${i + 1}`, `Q${i + 1}   ${question}`, { size: 9 }, { gap: 4 });
  });

  sectionHeading(layout, "reference.mom_test_heading", "Mom Test rules");
  model.momTestRules.forEach((rule, i) => {
    layout.lockedText(`reference.mom_test_rule_${i + 1}`, `•  ${rule}`, { size: 9 }, { gap: 3 });
  });

  sectionHeading(layout, "reference.pass_bar_heading", "Pass Bar");
  layout.lockedText("reference.pass_bar_preamble", model.passBar.preamble, { size: 8.5, color: MUTED }, { gap: 6 });
  model.passBar.conditions.forEach((condition, i) => {
    layout.lockedText(`reference.pass_bar_condition_${i + 1}`, `P${i + 1}   ${condition}`, { size: 9 }, { gap: 4 });
  });

  sectionHeading(layout, "reference.kill_criteria_heading", "Kill Criteria");
  model.killCriteria.forEach((criterion, i) => {
    layout.lockedText(`reference.kill_criterion_${i + 1}`, `K${i + 1}   ${criterion}`, { size: 9, color: ACCENT }, { gap: 4 });
  });

  sectionHeading(layout, "reference.after_each_call_heading", "After each call");
  model.afterEachCall.forEach((item, i) => {
    layout.lockedText(`reference.after_each_call_${i + 1}`, `•  ${item}`, { size: 9 }, { gap: 3 });
  });

  sectionHeading(layout, "reference.where_results_go_heading", "Where results go");
  layout.lockedText("reference.where_results_go", model.whereResultsGo, { size: 9 }, { gap: 0 });

  void sectionCount; // reserved: a future revision may summarise the chosen count here
}

function interviewSection(layout: LayoutBuilder, model: InterviewGuideModel, index: number, isAdditional: boolean): void {
  const prefix = `interview_${index}`;
  const title = isAdditional ? `Additional interview ${index - ROUND_SIZE}` : `Interview ${index}`;

  // Page A — the conversation
  layout.newPage();
  layout.setFooterLabel(`${title} · A`);
  sectionHeading(layout, `${prefix}.page_a_title`, isAdditional ? title : `${title} of ${ROUND_SIZE}`);

  labelLine(layout, "Interview date");
  const dateY = layout.y;
  layout.textFieldAt(`${prefix}.date_day`, { x: layout.margin, y: dateY - 15, width: 40, height: 15 }, 2);
  layout.textFieldAt(`${prefix}.date_month`, { x: layout.margin + 44, y: dateY - 15, width: 40, height: 15 }, 2);
  layout.textFieldAt(`${prefix}.date_year`, { x: layout.margin + 88, y: dateY - 15, width: 56, height: 15 }, 4);
  layout.advance(15 + 8);

  labelLine(layout, "Participant identifier");
  layout.textField(`${prefix}.participant`, { width: layout.usableWidth, height: 15, capacity: 30, gap: 8 });

  const halfWidth = (layout.usableWidth - 16) / 2;
  labelLine(layout, "Role and organisation");
  const roleY = layout.y;
  layout.textFieldAt(`${prefix}.role_organisation`, { x: layout.margin, y: roleY - 15, width: halfWidth, height: 15 }, 40);
  layout.y = roleY;
  labelLine(layout, "Where they were recruited", layout.margin + halfWidth + 16);
  layout.y = roleY;
  layout.textFieldAt(
    `${prefix}.recruitment_channel`,
    { x: layout.margin + halfWidth + 16, y: roleY - 15, width: halfWidth, height: 15 },
    30,
  );
  layout.advance(15 + 8);

  labelLine(layout, "How they match the beachhead customer");
  layout.textField(`${prefix}.beachhead_match`, { width: layout.usableWidth, height: 48, multiline: true, capacity: 250, gap: 8 });

  model.questions.forEach((question, i) => {
    layout.lockedText(`${prefix}.question_${i + 1}_prompt`, `Q${i + 1}   ${question}`, { size: 8.5, bold: true }, { gap: 3 });
    layout.textField(`${prefix}.question_${i + 1}_notes`, {
      width: layout.usableWidth,
      height: 80,
      multiline: true,
      capacity: 400,
      gap: 8,
    });
  });

  // Page B — evidence and assessment
  layout.newPage();
  layout.setFooterLabel(`${title} · B`);
  sectionHeading(layout, `${prefix}.page_b_title`, `${title} — evidence`);

  labelLine(layout, "Verbatim customer quotes — their words, not a summary");
  layout.textField(`${prefix}.verbatim_quotes`, { width: layout.usableWidth, height: 132, multiline: true, capacity: 620, gap: 8 });

  labelLine(layout, "Observed behaviour — what they have actually done");
  layout.textField(`${prefix}.observed_behaviour`, { width: layout.usableWidth, height: 90, multiline: true, capacity: 470, gap: 8 });

  labelLine(layout, "Existing workaround");
  const workaroundY = layout.y;
  layout.textFieldAt(
    `${prefix}.existing_workaround`,
    { x: layout.margin, y: workaroundY - 64, width: halfWidth, height: 64 },
    170,
    true,
  );
  layout.y = workaroundY;
  labelLine(layout, "Money or time already spent", layout.margin + halfWidth + 16);
  layout.y = workaroundY;
  layout.textFieldAt(
    `${prefix}.money_or_time_spent`,
    { x: layout.margin + halfWidth + 16, y: workaroundY - 64, width: halfWidth, height: 64 },
    170,
    true,
  );
  layout.advance(64 + 8);

  labelLine(layout, "Contradicting evidence — especially the inconvenient kind");
  layout.textField(`${prefix}.contradictions`, { width: layout.usableWidth, height: 90, multiline: true, capacity: 470, gap: 8 });

  twoColumnCheckboxes(layout, index, model.passBar.conditions.length);
  layout.lockedText(`${prefix}.observation_note`, OBSERVATION_NOTE, { size: 7, color: MUTED }, { gap: 8 });

  labelLine(layout, "Evidence-bearing extracts to take into the next module");
  layout.textField(`${prefix}.evidence_extracts`, { width: layout.usableWidth, height: 88, multiline: true, capacity: 400, gap: 0 });
}

function handoffPage(layout: LayoutBuilder, provenance: Provenance): void {
  layout.newPage();
  layout.setFooterLabel("Handoff");
  sectionHeading(layout, "handoff.title", "When the interviews are done");
  layout.lockedText(
    "handoff.body",
    "Return to Module 4 and provide the completed interview notes through the Module 4 evidence-input " +
      "flow. This PDF is not automatically synced back to AI Catalyst — keep it as your working copy.",
    { size: 11 },
    { gap: 10 },
  );
  layout.lockedText(
    "handoff.grading_note",
    "Module 4 grades what came back against the Pass Bar and Kill Criteria exactly as they were set " +
      "here, before any interviews happened. Three or four completed interviews are still worth " +
      "bringing — that is an incomplete round, not a failed one.",
    { size: 8.5, color: MUTED },
    { gap: 16 },
  );
  layout.lockedText(
    "handoff.provenance",
    `Source: ${provenance.sourceArtifactId} · Artifact version ${provenance.sourceArtifactVersion} · ` +
      `Program v${provenance.programVersionNumber} · Renderer ${provenance.rendererKey} · ` +
      `Generated ${provenance.generatedAt}`,
    { size: 7.5, color: MUTED },
    { gap: 0 },
  );
}

export function buildInterviewWorkbookPlan(
  model: InterviewGuideModel,
  provenance: Provenance,
  options: BuildInterviewWorkbookPlanOptions = {},
): WorkbookRenderPlan {
  const sectionCount = resolveSectionCount(
    PROBLEM_INTERVIEW_FIELD_MANIFEST_V1,
    options.sectionCount ?? 5,
  );

  const layout = new LayoutBuilder(REGULAR_FONTKIT_FONT, BOLD_FONTKIT_FONT);
  referencePage(layout, model, sectionCount);
  for (let i = 1; i <= sectionCount; i += 1) {
    interviewSection(layout, model, i, i > ROUND_SIZE);
  }
  handoffPage(layout, provenance);

  const { pages, fields, lockedContent, rects } = layout.toPlanParts();
  return { pages, fields, lockedContent, rects, provenance };
}

/**
 * The only place content equality between the confirmed InterviewGuideModel
 * and the plan is checked (see this file's header). Every piece of locked
 * Markdown-sourced text must survive into the plan verbatim, no locked entry
 * may be a placeholder, and every page must carry a footer.
 */
export function assertInterviewWorkbookPlan(plan: WorkbookRenderPlan, model: InterviewGuideModel): void {
  assertFooterOnEveryPage(plan);
  assertNoPlaceholderText(plan);

  assertAllPresent(plan, [model.ventureName], "venture name");
  assertAllPresent(plan, [model.interviewTarget], "interview target");
  assertAllPresent(plan, [model.whatThisInterviewTests], "what-this-interview-tests");
  assertAllPresent(plan, [model.whereResultsGo], "where-results-go");
  assertAllPresent(plan, model.questions, "question");
  assertAllPresent(plan, model.momTestRules, "Mom Test rule");
  assertAllPresent(plan, [model.passBar.preamble], "Pass Bar preamble");
  assertAllPresent(plan, model.passBar.conditions, "Pass Bar condition");
  assertAllPresent(plan, model.killCriteria, "Kill Criterion");
  assertAllPresent(plan, model.afterEachCall, "after-each-call item");
}
