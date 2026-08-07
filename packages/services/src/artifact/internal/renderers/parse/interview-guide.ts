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
  stripMarkdownEmphasis,
  substantiveListItems,
} from "@ai-catalyst/services/artifact/internal/markdown-sections";

export interface InterviewGuideModel {
  ventureName: string;
  interviewTarget: string;
  whatThisInterviewTests: string;
  questions: [string, string, string, string, string];
  momTestRules: string[];
  passBar: { preamble: string; conditions: string[] };
  killCriteria: [string, string, string];
  afterEachCall: string[];
  whereResultsGo: string;
}

const SOURCE_FILE = "Problem-Interview-Guide.md";

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

function requiredList(
  markdown: string,
  heading: string,
  bounds: { minimum: number; maximum: number },
): string[] {
  const body = getSection(markdown, 2, heading);
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

export function parseInterviewGuide(markdown: string): InterviewGuideModel {
  const ventureName = extractLabelValue(markdown, "Venture name");
  if (ventureName === null || !isSubstantiveText(ventureName)) {
    fail('is missing "Venture name" under Venture.');
  }

  const interviewTarget = requiredSection(markdown, 2, "Interview Target");
  const whatThisInterviewTests = requiredSection(markdown, 2, "What This Interview Tests");

  const questions = requiredList(markdown, "Five Interview Questions", { minimum: 5, maximum: 5 });
  const momTestRules = requiredList(markdown, "Mom Test Rules", { minimum: 4, maximum: 5 });

  const passBarBody = getSection(markdown, 2, "Pass Bar");
  if (passBarBody === null) {
    fail('is missing a "Pass Bar" section.');
  }
  const passBarConditions = requiredList(markdown, "Pass Bar", { minimum: 3, maximum: 4 });
  const passBarPreamble = leadingProse(passBarBody);
  if (!isSubstantiveText(passBarPreamble)) {
    fail('\'s "Pass Bar" section is missing its introductory sentence.');
  }

  const killCriteria = requiredList(markdown, "Kill Criteria", { minimum: 3, maximum: 3 });
  const afterEachCall = requiredList(markdown, "After Each Call", { minimum: 1, maximum: 20 });
  const whereResultsGo = requiredSection(markdown, 2, "Where Results Go");

  return {
    ventureName: stripMarkdownEmphasis(ventureName).trim(),
    interviewTarget,
    whatThisInterviewTests,
    questions: questions as [string, string, string, string, string],
    momTestRules,
    passBar: { preamble: passBarPreamble, conditions: passBarConditions },
    killCriteria: killCriteria as [string, string, string],
    afterEachCall,
    whereResultsGo,
  };
}
