// --- Ideal Customer Avatar plan ---
// buildPlan for ideal_customer_avatar_export_v1 — layout ported from the
// Design mockup; continuous flow (no forced page break), footer in chrome,
// provenance in PDF Info. See interview-workbook-plan.ts for shared architecture.
import {
  BOLD_FONTKIT_FONT,
  REGULAR_FONTKIT_FONT,
} from "@ai-catalyst/services/artifact/internal/renderers/pdf/embed-fonts";
import {
  A4,
  LayoutBuilder,
} from "@ai-catalyst/services/artifact/internal/renderers/pdf/layout-builder";
import { measureTextWidth } from "@ai-catalyst/services/artifact/internal/renderers/pdf/metrics";
import {
  assertAllPresent,
  assertFooterOnEveryPage,
  assertNoPlaceholderText,
} from "@ai-catalyst/services/artifact/internal/renderers/plan/shared-assertions";
import type { IdealCustomerAvatarModel } from "../parse/ideal-customer-avatar.js";
import type { Provenance, WorkbookRenderPlan } from "../types.js";

type RGB = { r: number; g: number; b: number };

const WHITE: RGB = { r: 1, g: 1, b: 1 };
const NAVY: RGB = { r: 0x1f / 255, g: 0x3a / 255, b: 0x5f / 255 };
const NAVY_MUTED_TEXT: RGB = { r: 0xa9 / 255, g: 0xbb / 255, b: 0xd0 / 255 };
const NAVY_BODY_TEXT: RGB = { r: 0xc9 / 255, g: 0xd6 / 255, b: 0xe4 / 255 };
const ACCENT: RGB = { r: 0xc2 / 255, g: 0x41 / 255, b: 0x0c / 255 };
const CARD_BG: RGB = { r: 0xf1 / 255, g: 0xf5 / 255, b: 0xf9 / 255 };
const GRID_BORDER: RGB = { r: 0xd8 / 255, g: 0xe0 / 255, b: 0xea / 255 };
const ROW_BG: RGB = { r: 0xf8 / 255, g: 0xfa / 255, b: 0xfc / 255 };
const MUTED_LABEL: RGB = { r: 0x64 / 255, g: 0x74 / 255, b: 0x8b / 255 };
const INK: RGB = { r: 0x1a / 255, g: 0x1a / 255, b: 0x1a / 255 };
const MUTED_BODY: RGB = { r: 0x4b / 255, g: 0x55 / 255, b: 0x63 / 255 };
// Side margin closer to the Capital-Raise example's ~50pt on Letter —
// still A4, so 38 keeps the body readable without the floating-card look
// of the previous 30pt inset under a full-bleed masthead.
const MARGIN = 38;
const MICRO_SIZE = 7;
const BODY_SIZE = 9.5;
const SECTION_GAP = 12;

/**
 * A micro-label line with a value block beneath it. Returns the total
 * height consumed from `topY` downward.
 */
function labelAndValue(
  layout: LayoutBuilder,
  role: string,
  label: string,
  text: string,
  topY: number,
  x: number,
  width: number,
  textSize: number,
  textColor: RGB,
  labelColor: RGB,
): number {
  layout.lockedText(
    `${role}.label`,
    label.toUpperCase(),
    { size: MICRO_SIZE, bold: true, color: labelColor },
    { x, y: topY },
  );
  const labelHeight = layout.linePitch(MICRO_SIZE, true);
  const valueTop = topY - labelHeight - 4;
  layout.lockedText(
    role,
    text,
    { size: textSize, color: textColor },
    { x, y: valueTop, maxWidth: width },
  );
  const valueHeight = layout.measuredHeight(text, textSize, width);
  return labelHeight + 4 + valueHeight;
}

/** A section micro-label with a hairline rule beneath it. */
function sectionRule(
  layout: LayoutBuilder,
  role: string,
  label: string,
  topY: number,
): number {
  layout.lockedText(
    `${role}.label`,
    label.toUpperCase(),
    { size: MICRO_SIZE, bold: true, color: MUTED_LABEL },
    { x: layout.margin, y: topY },
  );
  const ruleY = topY - layout.linePitch(MICRO_SIZE, true) - 5;
  layout.rectAt(
    { x: layout.margin, y: ruleY, width: layout.usableWidth, height: 0.75 },
    INK,
  );
  return topY - ruleY + 8;
}

/** A bulleted list, one lockedText entry per item. */
function bulletList(
  layout: LayoutBuilder,
  rolePrefix: string,
  items: string[],
  topY: number,
  x: number,
  width: number,
  size: number,
  color: RGB,
  itemGap = 5,
): number {
  let y = topY;
  for (let i = 0; i < items.length; i += 1) {
    const text = `·  ${items[i]}`;
    layout.lockedText(
      `${rolePrefix}.${i + 1}`,
      text,
      { size, color },
      { x, y, maxWidth: width },
    );
    y -= layout.measuredHeight(text, size, width) + itemGap;
  }
  return topY - y;
}

/**
 * Full-bleed navy masthead pinned to the page top (no white strip above).
 * Compact stack inspired by the Capital-Raise example — short venture
 * eyebrow, title, then an inline "Segment: …" line — with balanced pad
 * so the band does not read as a floating card.
 */
function header(layout: LayoutBuilder, model: IdealCustomerAvatarModel): void {
  layout.setFooterLabel("Ideal Customer Avatar");
  const innerX = MARGIN;
  const innerWidth = A4.width - innerX * 2;
  const pageTop = A4.height;
  const padTop = 16;
  const padBottom = 14;
  const titleSize = 18;
  const segmentSize = 9;

  let y = pageTop - padTop;
  // Drawn verbatim, never uppercased — model-derived content checked
  // against the confirmed venture name exactly as written.
  layout.lockedText(
    "header.venture",
    model.ventureName,
    { size: 8.5, bold: true, color: NAVY_MUTED_TEXT },
    { x: innerX, y },
  );
  y -= layout.linePitch(8.5, true) + 3;

  layout.lockedText(
    "header.title",
    "Ideal Customer Avatar",
    { size: titleSize, bold: true, color: WHITE },
    { x: innerX, y, maxWidth: innerWidth },
  );
  y -= layout.linePitch(titleSize, true) + 7;

  // Inline "SEGMENT  value" — same density as the example's "Segment: …"
  // rather than a stacked label/value pair that pads the band unevenly.
  const segmentLabel = "SEGMENT";
  layout.lockedText(
    "header.segment.label",
    segmentLabel,
    { size: MICRO_SIZE, bold: true, color: NAVY_MUTED_TEXT },
    { x: innerX, y },
  );
  const labelWidth =
    measureTextWidth(BOLD_FONTKIT_FONT, segmentLabel, MICRO_SIZE) + 8;
  layout.lockedText(
    "header.segment",
    model.segment,
    { size: segmentSize, color: NAVY_BODY_TEXT },
    {
      x: innerX + labelWidth,
      y: y + 0.5,
      maxWidth: Math.max(40, innerWidth - labelWidth),
    },
  );
  const segmentValueH = layout.measuredHeight(
    model.segment,
    segmentSize,
    Math.max(40, innerWidth - labelWidth),
  );
  y -= Math.max(layout.linePitch(MICRO_SIZE, true), segmentValueH) + padBottom;

  layout.rectAt({ x: 0, y, width: A4.width, height: pageTop - y }, NAVY);
  layout.y = y - 10;
}

/**
 * Snapshot band: WHO on its own full-width row (it is almost always the
 * longest field), then WHERE / STAGE / MOMENT in three equal columns so
 * short cells are not crushed by a four-way equal split.
 */
function snapshotGrid(
  layout: LayoutBuilder,
  model: IdealCustomerAvatarModel,
): void {
  const pad = 12;
  const whoInner = layout.usableWidth - pad * 2;
  const whoValueH = layout.measuredHeight(
    model.snapshot.who,
    BODY_SIZE,
    whoInner,
  );
  const whoBandH = 12 + layout.linePitch(MICRO_SIZE, true) + 4 + whoValueH + 12;

  const metaCols: Array<{ label: string; value: string; role: string }> = [
    { label: "Where", value: model.snapshot.where, role: "snapshot.where" },
    { label: "Stage", value: model.snapshot.stage, role: "snapshot.stage" },
    { label: "Moment", value: model.snapshot.raise, role: "snapshot.moment" },
  ];
  const metaColW = layout.usableWidth / 3;
  const metaInner = metaColW - pad * 2;
  const metaHeights = metaCols.map((col) =>
    layout.measuredHeight(col.value, BODY_SIZE, metaInner),
  );
  const metaBandH =
    12 + layout.linePitch(MICRO_SIZE, true) + 4 + Math.max(...metaHeights) + 12;

  layout.ensure(whoBandH + metaBandH);
  let top = layout.y;

  // WHO row
  layout.rectAt(
    { x: 0, y: top - whoBandH, width: A4.width, height: whoBandH },
    CARD_BG,
  );
  layout.rectAt(
    { x: 0, y: top - whoBandH, width: A4.width, height: 0.75 },
    GRID_BORDER,
  );
  labelAndValue(
    layout,
    "snapshot.who",
    "Who",
    model.snapshot.who,
    top - 12,
    layout.margin + pad,
    whoInner,
    BODY_SIZE,
    INK,
    MUTED_LABEL,
  );
  top -= whoBandH;

  // WHERE / STAGE / MOMENT row
  layout.rectAt(
    { x: 0, y: top - metaBandH, width: A4.width, height: metaBandH },
    CARD_BG,
  );
  layout.rectAt(
    { x: 0, y: top - metaBandH, width: A4.width, height: 0.75 },
    GRID_BORDER,
  );
  const tallestMeta =
    layout.linePitch(MICRO_SIZE, true) + 4 + Math.max(...metaHeights);
  metaCols.forEach((col, i) => {
    const x = layout.margin + i * metaColW;
    if (i > 0) {
      layout.rectAt(
        { x, y: top - metaBandH, width: 0.75, height: metaBandH },
        GRID_BORDER,
      );
    }
    const colContentH = layout.linePitch(MICRO_SIZE, true) + 4 + metaHeights[i];
    const centeringOffset = (tallestMeta - colContentH) / 2;
    labelAndValue(
      layout,
      col.role,
      col.label,
      col.value,
      top - 12 - centeringOffset,
      x + pad,
      metaInner,
      BODY_SIZE,
      INK,
      MUTED_LABEL,
    );
  });

  layout.y = top - metaBandH - SECTION_GAP;
}

/** Situation as a proper section heading + full-width body (not a skinny side label). */
function situation(
  layout: LayoutBuilder,
  model: IdealCustomerAvatarModel,
): void {
  layout.ensure(50);
  const headingHeight = sectionRule(layout, "situation", "Situation", layout.y);
  const top = layout.y - headingHeight;
  const height = layout.measuredHeight(
    model.situation,
    BODY_SIZE,
    layout.usableWidth,
  );
  layout.ensure(headingHeight + height + 4);
  layout.rectAt(
    { x: layout.margin, y: top - height - 2, width: 2, height: height + 2 },
    ACCENT,
  );
  layout.lockedText(
    "situation",
    model.situation,
    { size: BODY_SIZE, color: INK },
    {
      x: layout.margin + 10,
      y: top,
      maxWidth: layout.usableWidth - 10,
    },
  );
  layout.y = top - height - SECTION_GAP;
}

function unmetNeeds(
  layout: LayoutBuilder,
  model: IdealCustomerAvatarModel,
): void {
  layout.ensure(60);
  const headingHeight = sectionRule(
    layout,
    "unmet_needs",
    "Unmet needs",
    layout.y,
  );
  const top = layout.y - headingHeight;

  const gutter = 18;
  const colWidth = (layout.usableWidth - gutter) / 2;
  const rightX = layout.margin + colWidth + gutter;
  const headingSize = 10.5;

  layout.lockedText(
    "unmet_needs.functional_heading",
    "Functional — what they need done",
    { size: headingSize, bold: true, color: NAVY },
    { x: layout.margin, y: top, maxWidth: colWidth },
  );
  const leftListTop = top - layout.linePitch(headingSize, true) - 6;
  const leftHeight = bulletList(
    layout,
    "unmet_needs.functional",
    model.unmetNeeds.functional,
    leftListTop,
    layout.margin,
    colWidth,
    BODY_SIZE,
    INK,
  );

  layout.lockedText(
    "unmet_needs.emotional_heading",
    "Emotional & social — what they feel",
    { size: headingSize, bold: true, color: NAVY },
    { x: rightX, y: top, maxWidth: colWidth },
  );
  const rightListTop = top - layout.linePitch(headingSize, true) - 6;
  const rightHeight = bulletList(
    layout,
    "unmet_needs.emotional",
    model.unmetNeeds.emotional,
    rightListTop,
    rightX,
    colWidth,
    BODY_SIZE,
    INK,
  );

  const consumed =
    layout.linePitch(headingSize, true) + 6 + Math.max(leftHeight, rightHeight);
  layout.y = top - consumed - SECTION_GAP;
}

function buyingSignalCard(
  layout: LayoutBuilder,
  top: number,
  cardHeight: number,
  role: string,
  x: number,
  width: number,
  title: string,
  items: string[],
  accentColor: RGB,
): void {
  const pad = 11;
  const innerWidth = width - pad * 2;
  layout.rectAt({ x, y: top - cardHeight, width, height: cardHeight }, CARD_BG);
  layout.rectAt({ x, y: top, width, height: 1.5 }, accentColor);
  layout.lockedText(
    `${role}.title`,
    title,
    { size: 9.5, bold: true, color: accentColor },
    { x: x + pad, y: top - pad, maxWidth: innerWidth },
  );
  const itemsTop = top - pad - layout.linePitch(9.5, true) - 6;
  bulletList(
    layout,
    role,
    items,
    itemsTop,
    x + pad,
    innerWidth,
    BODY_SIZE,
    INK,
  );
}

/** Buying-signal cards use their own content height — no forced equal card. */
function buyingSignals(
  layout: LayoutBuilder,
  model: IdealCustomerAvatarModel,
): void {
  layout.ensure(60);
  const headingHeight = sectionRule(
    layout,
    "buying_signals",
    "Buying signals — behaviours and actions",
    layout.y,
  );
  const gutter = 16;
  const colWidth = (layout.usableWidth - gutter) / 2;
  const rightX = layout.margin + gutter + colWidth;

  const pad = 11;
  const titleHeight = layout.linePitch(9.5, true);
  const cardHeightFor = (items: string[]) =>
    pad +
    titleHeight +
    6 +
    items.reduce(
      (sum, item) =>
        sum +
        layout.measuredHeight(`·  ${item}`, BODY_SIZE, colWidth - pad * 2) +
        5,
      0,
    ) +
    pad;

  const leftH = cardHeightFor(model.buyingSignals.tier1);
  const rightH = cardHeightFor(model.buyingSignals.tier2);
  const top = layout.y - headingHeight;

  buyingSignalCard(
    layout,
    top,
    leftH,
    "buying_signals.tier1",
    layout.margin,
    colWidth,
    "Tier 1 — high intent (act in 24–48 hrs)",
    model.buyingSignals.tier1,
    ACCENT,
  );
  buyingSignalCard(
    layout,
    top,
    rightH,
    "buying_signals.tier2",
    rightX,
    colWidth,
    "Tier 2 — building intent, nurture over 4–12 weeks",
    model.buyingSignals.tier2,
    NAVY,
  );

  layout.y = top - Math.max(leftH, rightH) - SECTION_GAP;
}

function disqualifiers(
  layout: LayoutBuilder,
  model: IdealCustomerAvatarModel,
): void {
  layout.ensure(50);
  const headingHeight = sectionRule(
    layout,
    "disqualifiers",
    "Disqualifiers",
    layout.y,
  );
  const top = layout.y - headingHeight;
  const listH = bulletList(
    layout,
    "disqualifiers",
    model.disqualifiers,
    top,
    layout.margin,
    layout.usableWidth,
    BODY_SIZE,
    MUTED_BODY,
    6,
  );
  layout.y = top - listH - SECTION_GAP;
}

function corePromise(
  layout: LayoutBuilder,
  model: IdealCustomerAvatarModel,
): void {
  const padY = 14;
  const textWidth = layout.usableWidth;
  const promiseHeight = layout.measuredHeight(
    model.corePromise,
    10.5,
    textWidth,
  );
  const labelH = layout.linePitch(MICRO_SIZE, true);
  const bandHeight = padY + labelH + 6 + promiseHeight + padY;
  layout.ensure(bandHeight);

  const top = layout.y;
  layout.rectAt(
    { x: 0, y: top - bandHeight, width: A4.width, height: bandHeight },
    NAVY,
  );
  layout.lockedText(
    "core_promise.label",
    "CORE PROMISE",
    { size: MICRO_SIZE, bold: true, color: NAVY_MUTED_TEXT },
    { x: layout.margin, y: top - padY },
  );
  layout.lockedText(
    "core_promise",
    model.corePromise,
    { size: 10.5, color: WHITE },
    {
      x: layout.margin,
      y: top - padY - labelH - 6,
      maxWidth: textWidth,
    },
  );
  layout.y = top - bandHeight - SECTION_GAP;
}

/**
 * Validation Status as labelled rows (not a colon-joined text wall).
 * Short fields share a two-column row; longer fields get a full-width row
 * with clear vertical spacing so page 2 has real structure.
 */
function validationStatus(
  layout: LayoutBuilder,
  model: IdealCustomerAvatarModel,
): void {
  layout.ensure(80);
  const headingHeight = sectionRule(
    layout,
    "validation_status",
    "Validation status (internal — not a verdict)",
    layout.y,
  );
  layout.y -= headingHeight;

  const labelSize = 8;
  const valueSize = 9.5;
  const rowPad = 8;
  const gutter = 14;
  const labelH = layout.linePitch(labelSize, true);

  const drawFullRow = (role: string, label: string, value: string): void => {
    const valueH = layout.measuredHeight(
      value,
      valueSize,
      layout.usableWidth - 20,
    );
    const rowH = rowPad + labelH + 3 + valueH + rowPad;
    layout.ensure(rowH);
    const top = layout.y;
    layout.rectAt(
      {
        x: layout.margin,
        y: top - rowH,
        width: layout.usableWidth,
        height: rowH,
      },
      ROW_BG,
    );
    layout.lockedText(
      `${role}.label`,
      label.toUpperCase(),
      { size: labelSize, bold: true, color: MUTED_LABEL },
      { x: layout.margin + 10, y: top - rowPad },
    );
    layout.lockedText(
      role,
      value,
      { size: valueSize, color: INK },
      {
        x: layout.margin + 10,
        y: top - rowPad - labelH - 3,
        maxWidth: layout.usableWidth - 20,
      },
    );
    layout.y = top - rowH - 8;
  };

  // Current level + Based on observation share one row.
  {
    const colW = (layout.usableWidth - gutter) / 2;
    const leftValue = model.validationStatus.currentLevel;
    const rightValue = model.validationStatus.basedOnObservation;
    const leftValueH = layout.measuredHeight(leftValue, valueSize, colW - 20);
    const rightValueH = layout.measuredHeight(rightValue, valueSize, colW - 20);
    const rowH =
      rowPad + labelH + 3 + Math.max(leftValueH, rightValueH) + rowPad;
    layout.ensure(rowH);
    const top = layout.y;
    layout.rectAt(
      {
        x: layout.margin,
        y: top - rowH,
        width: layout.usableWidth,
        height: rowH,
      },
      ROW_BG,
    );
    layout.lockedText(
      "validation_status.current_level.label",
      "CURRENT LEVEL",
      { size: labelSize, bold: true, color: MUTED_LABEL },
      { x: layout.margin + 10, y: top - rowPad },
    );
    layout.lockedText(
      "validation_status.current_level",
      leftValue,
      { size: valueSize, color: INK },
      {
        x: layout.margin + 10,
        y: top - rowPad - labelH - 3,
        maxWidth: colW - 20,
      },
    );
    const rightX = layout.margin + colW + gutter;
    layout.lockedText(
      "validation_status.based_on_observation.label",
      "BASED ON OBSERVATION",
      { size: labelSize, bold: true, color: MUTED_LABEL },
      { x: rightX + 10, y: top - rowPad },
    );
    layout.lockedText(
      "validation_status.based_on_observation",
      rightValue,
      { size: valueSize, color: INK },
      {
        x: rightX + 10,
        y: top - rowPad - labelH - 3,
        maxWidth: colW - 20,
      },
    );
    layout.y = top - rowH - 8;
  }

  drawFullRow(
    "validation_status.founder_assumptions",
    "Founder assumptions",
    model.validationStatus.founderAssumptions,
  );
  drawFullRow(
    "validation_status.important_unknowns",
    "Important unknowns",
    model.validationStatus.importantUnknowns,
  );
  drawFullRow(
    "validation_status.contradicting_evidence",
    "Contradicting evidence",
    model.validationStatus.contradictingEvidence,
  );
  drawFullRow(
    "validation_status.highest_priority_questions",
    "Highest-priority questions",
    model.validationStatus.highestPriorityQuestions,
  );
}

export function buildIdealCustomerAvatarPlan(
  model: IdealCustomerAvatarModel,
  provenance: Provenance,
): WorkbookRenderPlan {
  const layout = new LayoutBuilder(REGULAR_FONTKIT_FONT, BOLD_FONTKIT_FONT, {
    margin: MARGIN,
  });
  header(layout, model);
  snapshotGrid(layout, model);
  situation(layout, model);
  unmetNeeds(layout, model);
  buyingSignals(layout, model);
  disqualifiers(layout, model);
  corePromise(layout, model);
  validationStatus(layout, model);

  const { pages, fields, lockedContent, rects } = layout.toPlanParts();
  return { pages, fields, lockedContent, rects, provenance };
}

/**
 * The only place content equality between the confirmed
 * IdealCustomerAvatarModel and the plan is checked — see
 * interview-workbook-plan.ts's header for the shared rationale.
 */
export function assertIdealCustomerAvatarPlan(
  plan: WorkbookRenderPlan,
  model: IdealCustomerAvatarModel,
): void {
  assertFooterOnEveryPage(plan);
  assertNoPlaceholderText(plan);

  assertAllPresent(plan, [model.ventureName], "venture name");
  assertAllPresent(plan, [model.segment], "segment");
  assertAllPresent(
    plan,
    [
      model.snapshot.who,
      model.snapshot.where,
      model.snapshot.stage,
      model.snapshot.raise,
    ],
    "snapshot field",
  );
  assertAllPresent(plan, [model.situation], "situation");
  assertAllPresent(plan, model.unmetNeeds.functional, "functional unmet need");
  assertAllPresent(plan, model.unmetNeeds.emotional, "emotional unmet need");
  assertAllPresent(plan, model.buyingSignals.tier1, "Tier 1 buying signal");
  assertAllPresent(plan, model.buyingSignals.tier2, "Tier 2 buying signal");
  assertAllPresent(plan, model.disqualifiers, "disqualifier");
  assertAllPresent(plan, [model.corePromise], "core promise");
  assertAllPresent(
    plan,
    [
      model.validationStatus.currentLevel,
      model.validationStatus.basedOnObservation,
      model.validationStatus.founderAssumptions,
      model.validationStatus.importantUnknowns,
      model.validationStatus.contradictingEvidence,
      model.validationStatus.highestPriorityQuestions,
    ],
    "validation status field",
  );
}
