// Confirmed Markdown -> typed model for problem_interview_workbook_v1.
// Throws on anything missing or out of shape — never defaults, never
// infers. Reuses the same pure Markdown helpers the validators use
// (../../markdown-sections.ts); this parser adds no new parsing primitives,
// only the specific shape and arity checks this renderer's Markdown
// template guarantees (Problem-Interview-Guide.md, see
// content-seed/content/module-3.ts).
import {
  extractLabelValue,
  getSection,
  isSubstantiveText,
  parseTable,
  stripMarkdownEmphasis,
  substantiveListItems,
  tableColumnIndex,
} from "@ai-catalyst/services/artifact/internal/markdown-sections";

export interface QuestionGuidanceModel {
  listenFor: string[];
  suggestion: string;
}

export interface AssumptionRowModel {
  assumption: string;
  validatedIf: string;
  invalidatedIf: string;
}

export interface InterviewGuideModel {
  ventureName: string;
  interviewTarget: string;
  whatThisInterviewTests: string;
  openingScript: string;
  questions: [string, string, string, string, string];
  questionGuidance: [
    QuestionGuidanceModel,
    QuestionGuidanceModel,
    QuestionGuidanceModel,
    QuestionGuidanceModel,
    QuestionGuidanceModel,
  ];
  momTestRules: string[];
  passBar: { preamble: string; conditions: string[] };
  killCriteria: [string, string];
  assumptions: AssumptionRowModel[];
  closingQuestions: [string, string];
  afterEachCall: string[];
  whereResultsGo: string;
}

const SOURCE_FILE = "Problem-Interview-Guide.md";

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

function requiredList(
  markdown: string,
  heading: string,
  bounds: { minimum: number; maximum: number },
): string[] {
  const body = getSection(markdown, 2, heading);
  if (body === null) {
    fail(`is missing a "${heading}" section.`);
  }
  const items = substantiveListItems(body).map((item) =>
    stripMarkdownEmphasis(item).trim(),
  );
  if (items.length < bounds.minimum || items.length > bounds.maximum) {
    fail(
      `'s "${heading}" section must contain ${
        bounds.minimum === bounds.maximum
          ? bounds.minimum
          : `${bounds.minimum}-${bounds.maximum}`
      } item(s), found ${items.length}.`,
    );
  }
  return items;
}

// A list section's introductory sentence — e.g. Pass Bar's "For this
// five-interview validation round, the problem meets the pass bar when at
// least 3 of 5 interviews satisfy the conditions below:" — is the prose
// before the first list marker, not itself a list item. Locked content, so
// it must render on the reference page alongside the conditions it
// introduces.
const LIST_MARKER = /^\s*(?:\d+[.)]\s*|[-*](?!\*)\s+)/;

function leadingProse(sectionBody: string): string {
  const lines: string[] = [];
  for (const line of sectionBody.split("\n")) {
    if (LIST_MARKER.test(line)) break;
    if (line.trim().length > 0) lines.push(line.trim());
  }
  return stripMarkdownEmphasis(lines.join(" ")).trim();
}

// Q1-Q5's "**Listen for:**" bullets and "**Suggestion:**" note are bold
// labels inside a level-3 subsection, not headings or the label_present /
// range_named_items shapes the other helpers already cover — so this parser
// adds the one shape those don't: a list bounded by one label and the next.
const BOLD_LABEL_LINE = /^\s*\*\*[^*]+:\*\*/;

function requiredLabeledList(
  sectionBody: string,
  label: string,
  bounds: { minimum: number; maximum: number },
  context: string,
): string[] {
  const lines = sectionBody.split("\n");
  const labelPattern = new RegExp(`^\\s*\\*\\*${label}:\\*\\*\\s*$`, "i");
  const startIndex = lines.findIndex((line) => labelPattern.test(line));
  if (startIndex === -1) {
    fail(`'s "${context}" is missing a "${label}" list.`);
  }
  let endIndex = lines.length;
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    if (BOLD_LABEL_LINE.test(lines[i])) {
      endIndex = i;
      break;
    }
  }
  const items = substantiveListItems(
    lines.slice(startIndex + 1, endIndex).join("\n"),
  ).map((item) => stripMarkdownEmphasis(item).trim());
  if (items.length < bounds.minimum || items.length > bounds.maximum) {
    fail(
      `'s "${context}" "${label}" list must contain ${
        bounds.minimum === bounds.maximum
          ? bounds.minimum
          : `${bounds.minimum}-${bounds.maximum}`
      } item(s), found ${items.length}.`,
    );
  }
  return items;
}

function requiredLabeledNote(
  sectionBody: string,
  label: string,
  context: string,
): string {
  const value = extractLabelValue(sectionBody, label);
  if (value === null || !isSubstantiveText(value)) {
    fail(`'s "${context}" is missing a "${label}" note.`);
  }
  return stripMarkdownEmphasis(value).trim();
}

function requiredQuestionGuidance(
  markdown: string,
  index: 1 | 2 | 3 | 4 | 5,
): QuestionGuidanceModel {
  const heading = `Q${index}`;
  const body = getSection(markdown, 3, heading);
  if (body === null) {
    fail(`is missing a "${heading}" subsection under Question Guidance.`);
  }
  return {
    listenFor: requiredLabeledList(
      body,
      "Listen for",
      { minimum: 2, maximum: 4 },
      heading,
    ),
    suggestion: requiredLabeledNote(body, "Suggestion", heading),
  };
}

function requiredAssumptionsTable(
  markdown: string,
  bounds: { minimum: number; maximum: number },
): AssumptionRowModel[] {
  const heading = "Assumptions Being Validated";
  const body = getSection(markdown, 2, heading);
  if (body === null) {
    fail(`is missing an "${heading}" section.`);
  }
  const table = parseTable(body);
  if (table === null) {
    fail(`'s "${heading}" section is not a table.`);
  }
  const assumptionIndex = tableColumnIndex(table.headers, "Assumption");
  const validatedIndex = tableColumnIndex(table.headers, "Validated if…");
  const invalidatedIndex = tableColumnIndex(table.headers, "Invalidated if…");
  if (
    assumptionIndex === -1 ||
    validatedIndex === -1 ||
    invalidatedIndex === -1
  ) {
    fail(`'s "${heading}" table is missing a required column.`);
  }
  if (
    table.rows.length < bounds.minimum ||
    table.rows.length > bounds.maximum
  ) {
    fail(
      `'s "${heading}" table must contain ${bounds.minimum}-${bounds.maximum} row(s), found ${table.rows.length}.`,
    );
  }
  return table.rows.map((row) => ({
    assumption: row[assumptionIndex] ?? "",
    validatedIf: row[validatedIndex] ?? "",
    invalidatedIf: row[invalidatedIndex] ?? "",
  }));
}

export function parseInterviewGuide(markdown: string): InterviewGuideModel {
  const ventureName = extractLabelValue(markdown, "Venture name");
  if (ventureName === null || !isSubstantiveText(ventureName)) {
    fail('is missing "Venture name" under Venture.');
  }

  const interviewTarget = requiredSection(markdown, 2, "Interview Target");
  const whatThisInterviewTests = requiredSection(
    markdown,
    2,
    "What This Interview Tests",
  );
  const openingScript = requiredSection(markdown, 2, "Opening Script");

  const questions = requiredList(markdown, "Five Interview Questions", {
    minimum: 5,
    maximum: 5,
  });
  const questionGuidance: InterviewGuideModel["questionGuidance"] = [
    requiredQuestionGuidance(markdown, 1),
    requiredQuestionGuidance(markdown, 2),
    requiredQuestionGuidance(markdown, 3),
    requiredQuestionGuidance(markdown, 4),
    requiredQuestionGuidance(markdown, 5),
  ];
  const momTestRules = requiredList(markdown, "Mom Test Rules", {
    minimum: 4,
    maximum: 5,
  });

  const passBarBody = getSection(markdown, 2, "Pass Bar");
  if (passBarBody === null) {
    fail('is missing a "Pass Bar" section.');
  }
  const passBarConditions = requiredList(markdown, "Pass Bar", {
    minimum: 3,
    maximum: 4,
  });
  const passBarPreamble = leadingProse(passBarBody);
  if (!isSubstantiveText(passBarPreamble)) {
    fail('\'s "Pass Bar" section is missing its introductory sentence.');
  }

  const killCriteria = requiredList(markdown, "Kill Criteria", {
    minimum: 2,
    maximum: 2,
  });
  const assumptions = requiredAssumptionsTable(markdown, {
    minimum: 3,
    maximum: 7,
  });
  const closingQuestions = requiredList(markdown, "Closing Questions", {
    minimum: 2,
    maximum: 2,
  });
  const afterEachCall = requiredList(markdown, "After Each Call", {
    minimum: 1,
    maximum: 20,
  });
  const whereResultsGo = requiredSection(markdown, 2, "Where Results Go");

  return {
    ventureName: stripMarkdownEmphasis(ventureName).trim(),
    interviewTarget,
    whatThisInterviewTests,
    openingScript,
    questions: questions as [string, string, string, string, string],
    questionGuidance,
    momTestRules,
    passBar: { preamble: passBarPreamble, conditions: passBarConditions },
    killCriteria: killCriteria as [string, string],
    assumptions,
    closingQuestions: closingQuestions as [string, string],
    afterEachCall,
    whereResultsGo,
  };
}
