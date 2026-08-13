// Confirmed Markdown -> typed model for ideal_customer_avatar_export_v1. See
// interview-guide.ts's header for the shared reuse rationale; this file
// adds the specific shape checks Ideal-Customer-Avatar.md's template
// guarantees (see content-seed/content/module-2.ts).
import {
  extractLabelValue,
  getSection,
  isSubstantiveText,
  matchesRecordedUnknown,
  stripMarkdownEmphasis,
  substantiveListItems,
} from "@ai-catalyst/services/artifact/internal/markdown-sections";

export interface IdealCustomerAvatarModel {
  ventureName: string;
  segment: string;
  snapshot: { who: string; where: string; stage: string; raise: string };
  situation: string;
  unmetNeeds: { functional: string[]; emotional: string[] };
  buyingSignals: { tier1: string[]; tier2: string[] };
  disqualifiers: string[];
  corePromise: string;
  // Internal/administrative — "a current snapshot, not a final validation
  // verdict" per the template's own wording. Not part of the Claude Design
  // mockup's client-facing masthead/grid/cards, but every one of these is a
  // required, non-null-escaping heading in the confirmed template, so it is
  // still rendered — compactly, at reduced visual weight — rather than
  // silently dropped (renderer-template-contract.test.ts's reverse check
  // exists precisely to catch a renderer that covers a heading's presence
  // but not its content).
  validationStatus: {
    currentLevel: string;
    basedOnObservation: string;
    founderAssumptions: string;
    importantUnknowns: string;
    contradictingEvidence: string;
    highestPriorityQuestions: string;
  };
}

const SOURCE_FILE = "Ideal-Customer-Avatar.md";

function fail(message: string): never {
  throw new Error(`WORKBOOK_RENDER_FAILED: ${SOURCE_FILE} ${message}`);
}

function requiredSection(
  markdown: string,
  level: number,
  heading: string,
): string {
  const body = getSection(markdown, level, heading);
  if (body === null || !isSubstantiveText(body)) {
    fail(`is missing a non-empty "${heading}" section.`);
  }
  return stripMarkdownEmphasis(body).trim();
}

function requiredLabel(
  markdown: string,
  label: string | readonly string[],
  scope: { level: number; heading: string },
): string {
  const scoped = getSection(markdown, scope.level, scope.heading);
  if (scoped === null) {
    fail(`is missing a "${scope.heading}" section.`);
  }
  const labels = typeof label === "string" ? [label] : label;
  for (const candidate of labels) {
    const value = extractLabelValue(scoped, candidate);
    if (value !== null && isSubstantiveText(value)) {
      return stripMarkdownEmphasis(value).trim();
    }
  }
  fail(`is missing "${labels[0]}" under "${scope.heading}".`);
}

/**
 * A count-bound list section that the confirmed submission rule also lets
 * be a single "not yet known" sentence instead of concrete items
 * (`orRecordedUnknown` in module-2.ts's validationConfig) — re-verified
 * here rather than trusted from that confirmation, same defensive
 * philosophy as validation-roadmap.ts's Start-Here/experiment-1 cross-check.
 * Either shape renders the same way: as however many lines this returns.
 */
function requiredItemsOrUnknown(
  markdown: string,
  level: number,
  heading: string,
  bounds: { minimum: number; maximum: number },
): string[] {
  const body = getSection(markdown, level, heading);
  if (body === null) {
    fail(`is missing a "${heading}" section.`);
  }
  const items = substantiveListItems(body).map((item) =>
    stripMarkdownEmphasis(item).trim(),
  );
  if (items.length === 0) {
    const prose = stripMarkdownEmphasis(body).trim();
    if (!isSubstantiveText(prose) || !matchesRecordedUnknown(prose)) {
      fail(
        `'s "${heading}" section must contain ${bounds.minimum}-${bounds.maximum} items, or state that they are not yet known.`,
      );
    }
    return [prose];
  }
  if (items.length < bounds.minimum || items.length > bounds.maximum) {
    fail(
      `'s "${heading}" section must contain ${bounds.minimum}-${bounds.maximum} item(s), found ${items.length}.`,
    );
  }
  return items;
}

export function parseIdealCustomerAvatar(
  markdown: string,
): IdealCustomerAvatarModel {
  const ventureName = extractLabelValue(markdown, "Venture name");
  if (ventureName === null || !isSubstantiveText(ventureName)) {
    fail('is missing "Venture name" under Venture.');
  }

  const segment = requiredSection(markdown, 2, "Segment");

  const snapshot = {
    who: requiredLabel(markdown, "WHO", { level: 2, heading: "Snapshot" }),
    where: requiredLabel(markdown, "WHERE", { level: 2, heading: "Snapshot" }),
    stage: requiredLabel(markdown, "STAGE", { level: 2, heading: "Snapshot" }),
    // Prefer the current template label; keep the pre-rename form so
    // already-confirmed artefacts on staging/prod still render as PDF.
    raise: requiredLabel(
      markdown,
      ["CURRENT COMMERCIAL MOMENT", "RAISE / CURRENT COMMERCIAL MOMENT"],
      {
        level: 2,
        heading: "Snapshot",
      },
    ),
  };

  const situation = requiredSection(markdown, 2, "Situation");

  const unmetNeeds = {
    functional: requiredItemsOrUnknown(
      markdown,
      3,
      "Functional — what they need done",
      {
        minimum: 3,
        maximum: 6,
      },
    ),
    emotional: requiredItemsOrUnknown(
      markdown,
      3,
      "Emotional and social — what they feel",
      {
        minimum: 3,
        maximum: 6,
      },
    ),
  };

  const buyingSignals = {
    tier1: requiredItemsOrUnknown(
      markdown,
      3,
      "Tier 1 — high intent (act in 24–48 hrs)",
      {
        minimum: 3,
        maximum: 5,
      },
    ),
    tier2: requiredItemsOrUnknown(
      markdown,
      3,
      "Tier 2 — building intent, nurture over 4–12 weeks",
      {
        minimum: 3,
        maximum: 5,
      },
    ),
  };

  const disqualifiers = requiredItemsOrUnknown(markdown, 2, "Disqualifiers", {
    minimum: 3,
    maximum: 20,
  });
  const corePromise = requiredSection(markdown, 2, "Core Promise");

  const validationStatus = {
    currentLevel: requiredLabel(markdown, "Current level", {
      level: 2,
      heading: "Validation Status",
    }),
    basedOnObservation: requiredSection(markdown, 3, "Based on observation"),
    founderAssumptions: requiredSection(markdown, 3, "Founder assumptions"),
    importantUnknowns: requiredSection(markdown, 3, "Important unknowns"),
    contradictingEvidence: requiredSection(
      markdown,
      3,
      "Contradicting evidence",
    ),
    highestPriorityQuestions: requiredSection(
      markdown,
      3,
      "Highest-priority validation questions",
    ),
  };

  return {
    ventureName: stripMarkdownEmphasis(ventureName).trim(),
    segment,
    snapshot,
    situation,
    unmetNeeds,
    buyingSignals,
    disqualifiers,
    corePromise,
    validationStatus,
  };
}
