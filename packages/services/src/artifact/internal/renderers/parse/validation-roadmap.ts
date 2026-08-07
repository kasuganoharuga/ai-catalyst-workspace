// Confirmed Markdown -> typed model for validation_roadmap_workbook_v1.
// Throws on anything missing or out of shape. See interview-guide.ts's
// header for the shared reuse rationale; this file adds the specific shape
// checks Validation-Roadmap-30-Day.md's template guarantees (see
// content-seed/content/module-4.ts).
import {
  extractLabelValue,
  getSection,
  isSubstantiveText,
  normalizeComparisonValue,
  parseTable,
  stripMarkdownEmphasis,
  substantiveListItems,
  tableColumnIndex,
} from "@ai-catalyst/services/artifact/internal/markdown-sections";

export interface Experiment {
  name: string;
  claimTested: string;
  passCondition: string;
  failCondition: string;
  time: string;
  cost: string;
  signalStrength: number;
  window: string;
}

export interface ValidationRoadmapModel {
  ventureName: string;
  constraints: { timeAvailable: string; budget: string; customerAccess: string };
  whatTheseExperimentsTest: string;
  experiments: Experiment[];
  signalStrengthAnchors: [string, string, string, string, string];
  startHere: { whatToDo: string; whoToContact: string; pass: string; fail: string };
  howToRecordResults: string;
}

const SOURCE_FILE = "Validation-Roadmap-30-Day.md";
const EXPERIMENTS_HEADING = "Experiments";
const REQUIRED_COLUMNS = [
  "Experiment",
  "Claim tested",
  "Pass condition",
  "Fail condition",
  "Time",
  "Cost",
  "Expected evidence signal strength (1–5)",
  "30-day window",
] as const;

function fail(message: string): never {
  throw new Error(`WORKBOOK_RENDER_FAILED: ${SOURCE_FILE} ${message}`);
}

function requiredSection(markdown: string, level: number, heading: string): string {
  const body = getSection(markdown, level, heading);
  if (body === null || !isSubstantiveText(body)) {
    fail(`is missing a non-empty "${heading}" section.`);
  }
  return stripMarkdownEmphasis(body).trim();
}

function requiredLabel(markdown: string, label: string, scope: { level: number; heading: string }): string {
  const scoped = getSection(markdown, scope.level, scope.heading);
  if (scoped === null) {
    fail(`is missing a "${scope.heading}" section.`);
  }
  const value = extractLabelValue(scoped, label);
  if (value === null || !isSubstantiveText(value)) {
    fail(`is missing "${label}" under "${scope.heading}".`);
  }
  return stripMarkdownEmphasis(value).trim();
}

function requiredList(
  markdown: string,
  level: number,
  heading: string,
  bounds: { minimum: number; maximum: number },
): string[] {
  const body = getSection(markdown, level, heading);
  if (body === null) {
    fail(`is missing a "${heading}" section.`);
  }
  const items = substantiveListItems(body).map((item) => stripMarkdownEmphasis(item).trim());
  if (items.length < bounds.minimum || items.length > bounds.maximum) {
    fail(
      `'s "${heading}" section must contain ${
        bounds.minimum === bounds.maximum ? bounds.minimum : `${bounds.minimum}-${bounds.maximum}`
      } item(s), found ${items.length}.`,
    );
  }
  return items;
}

function parseExperiments(markdown: string): Experiment[] {
  const body = getSection(markdown, 2, EXPERIMENTS_HEADING);
  if (body === null) {
    fail(`is missing an "${EXPERIMENTS_HEADING}" section.`);
  }
  const table = parseTable(body);
  if (table === null) {
    fail(`'s "${EXPERIMENTS_HEADING}" section does not contain a Markdown table.`);
  }
  if (table.rows.length < 2 || table.rows.length > 3) {
    fail(`'s "${EXPERIMENTS_HEADING}" table must have 2-3 rows, found ${table.rows.length}.`);
  }

  const columnIndex: Record<(typeof REQUIRED_COLUMNS)[number], number> = {} as Record<
    (typeof REQUIRED_COLUMNS)[number],
    number
  >;
  for (const column of REQUIRED_COLUMNS) {
    const index = tableColumnIndex(table.headers, column);
    if (index === -1) {
      fail(`'s "${EXPERIMENTS_HEADING}" table is missing the "${column}" column.`);
    }
    columnIndex[column] = index;
  }

  return table.rows.map((row, rowIndex) => {
    const cell = (column: (typeof REQUIRED_COLUMNS)[number]): string => {
      const raw = row[columnIndex[column]]?.trim() ?? "";
      if (!isSubstantiveText(raw)) {
        fail(`'s "${EXPERIMENTS_HEADING}" table row ${rowIndex + 1} is missing "${column}".`);
      }
      return stripMarkdownEmphasis(raw).trim();
    };

    const signalStrengthRaw = cell("Expected evidence signal strength (1–5)");
    const signalStrength = Number.parseInt(signalStrengthRaw, 10);
    if (!Number.isInteger(signalStrength) || signalStrength < 1 || signalStrength > 5) {
      fail(
        `'s "${EXPERIMENTS_HEADING}" table row ${rowIndex + 1} has an invalid signal strength: "${signalStrengthRaw}".`,
      );
    }

    return {
      name: cell("Experiment"),
      claimTested: cell("Claim tested"),
      passCondition: cell("Pass condition"),
      failCondition: cell("Fail condition"),
      time: cell("Time"),
      cost: cell("Cost"),
      signalStrength,
      window: cell("30-day window"),
    };
  });
}

export function parseValidationRoadmap(markdown: string): ValidationRoadmapModel {
  const ventureName = extractLabelValue(markdown, "Venture name");
  if (ventureName === null || !isSubstantiveText(ventureName)) {
    fail('is missing "Venture name" under Venture.');
  }

  const constraints = {
    timeAvailable: requiredLabel(markdown, "Time available", { level: 2, heading: "Constraints" }),
    budget: requiredLabel(markdown, "Budget", { level: 2, heading: "Constraints" }),
    customerAccess: requiredLabel(markdown, "Customer access", { level: 2, heading: "Constraints" }),
  };

  const whatTheseExperimentsTest = requiredSection(markdown, 2, "What These Experiments Test");
  const experiments = parseExperiments(markdown);

  const signalStrengthAnchors = requiredList(markdown, 3, "Expected evidence signal strength", {
    minimum: 5,
    maximum: 5,
  });

  const startHere = {
    whatToDo: requiredLabel(markdown, "What to do", { level: 2, heading: "Start Here" }),
    whoToContact: requiredLabel(markdown, "Who to contact, and how", { level: 2, heading: "Start Here" }),
    pass: requiredLabel(markdown, "What counts as a pass", { level: 2, heading: "Start Here" }),
    fail: requiredLabel(markdown, "What counts as a fail", { level: 2, heading: "Start Here" }),
  };

  // Re-asserted here even though a submission rule already guarantees this
  // for confirmed Markdown: the renderer draws both Start Here and
  // experiment 1's own pass/fail condition independently, and a mismatch
  // would put two different pass bars on the Founder's desk.
  if (normalizeComparisonValue(startHere.pass) !== normalizeComparisonValue(experiments[0].passCondition)) {
    fail(
      '\'s "Start Here" pass condition does not match the first Experiment row\'s pass condition — refusing to render two different pass bars.',
    );
  }
  if (normalizeComparisonValue(startHere.fail) !== normalizeComparisonValue(experiments[0].failCondition)) {
    fail(
      '\'s "Start Here" fail condition does not match the first Experiment row\'s fail condition — refusing to render two different pass bars.',
    );
  }

  const howToRecordResults = requiredSection(markdown, 2, "How to Record Results");

  return {
    ventureName: stripMarkdownEmphasis(ventureName).trim(),
    constraints,
    whatTheseExperimentsTest,
    experiments,
    signalStrengthAnchors: signalStrengthAnchors as [string, string, string, string, string],
    startHere,
    howToRecordResults,
  };
}
