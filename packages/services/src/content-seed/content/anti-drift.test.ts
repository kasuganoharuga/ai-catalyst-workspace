import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { structuredMarkdownV1 } from "../../artifact/internal/validators/structured-markdown-v1.js";
import type { ValidationContext } from "../../artifact/internal/validators/types.js";
import { DEFAULT_TOOLKIT_CONTENT } from "./index.js";
import { PROMPTS_CONTENT } from "./prompts.js";

// The canonical source of truth for Modules 2-4 is the reviewed Markdown
// under packages/toolkit-content/skills/ — the TypeScript constants in
// content/module-2.ts, module-3.ts, module-4.ts and prompts.ts are copies,
// hand-ported once. Nothing stops the two from silently diverging on the
// next Markdown edit, so these tests re-derive the expected TypeScript
// content from the source files on every run.

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOOLKIT_CONTENT_ROOT = join(
  __dirname,
  "../../../../toolkit-content/skills",
);

// Normalises CRLF to LF: these source files are read on whatever line
// endings the working tree checked them out with (this repo has files on
// both), while the seeded TypeScript constants they're compared against
// were authored with plain `\n` throughout.
function readSourceFile(relativePath: string): string {
  return readFileSync(
    join(TOOLKIT_CONTENT_ROOT, relativePath),
    "utf-8",
  ).replace(/\r\n/g, "\n");
}

// ---------------------------------------------------------------------------
// Template drift: templateMarkdown must equal the authoring template with
// its authoring hints removed, not merely resemble it.
// ---------------------------------------------------------------------------
//
// `<angle-bracket hints>` are removed structure-aware, not by a blind
// delete: a list item or bold sentence whose entire content is
// hint-derived (the Five Whys "1. **Why <the question as it was
// asked>?**", or "**Root cause emerges at Why <n>.**") must lose its whole
// body, not be left as "1. **Why ?**" or "**Root cause emerges at Why
// .**" — either of which would still read as substantive content to the
// validator's substantive-text check and defeat the point of stripping.

const HEADING_PATTERN = /^#{1,6}\s/;
const TABLE_LINE_PATTERN = /^\s*\|/;
const LIST_ITEM_LINE_PATTERN = /^\s*(?:\d+[.)]\s*|[-*](?!\*)\s*)/;
const LIST_ITEM_MARKER_PATTERN = /^\s*(?:\d+[.)]|[-*](?!\*))/;
const BOLD_LABEL_PATTERN = /^\s*\*\*[^*]+:\*\*/;
const LIST_ITEM_LABEL_PATTERN = /^\s*[-*](?!\*)\s+[^:]+:\s*/;
const HINT_SPAN_PATTERN = /<[^<>]*>/gs;
const BARE_LIST_MARKER_PATTERN = /^\s*(?:\d+[.)]|[-*](?!\*))\s*$/;

function isTableBlock(block: string): boolean {
  return block.split("\n").every((line) => TABLE_LINE_PATTERN.test(line));
}

function isListBlock(block: string): boolean {
  return block.split("\n").every((line) => LIST_ITEM_LINE_PATTERN.test(line));
}

function isBareListMarkerBlock(block: string): boolean {
  return !block.includes("\n") && BARE_LIST_MARKER_PATTERN.test(block);
}

// A hint span can itself cross blank lines — e.g. Problem-Statement.md's
// Verdict footnote is one `<...>` wrapping three blank-line-separated
// paragraphs. Splitting into blank-line-delimited blocks *before* removing
// hints would leave the middle paragraph with no literal `<`/`>` of its
// own, so a per-block substring check misses it. Instead this walks every
// hint span once over the whole (trimmed) source and marks every physical
// line it touches, so block classification below can ask "does this
// block contain any hint-touched line" rather than "does this block's own
// text contain a bracket".
function computeHintLineMask(raw: string, lines: string[]): boolean[] {
  const mask = new Array(lines.length).fill(false);
  const lineStarts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineStarts.push(offset);
    offset += line.length + 1;
  }

  for (const match of raw.matchAll(HINT_SPAN_PATTERN)) {
    const start = match.index;
    const end = start + match[0].length;
    let lo = 0;
    while (lo < lineStarts.length - 1 && lineStarts[lo + 1] <= start) lo += 1;
    let hi = lo;
    while (hi < lineStarts.length - 1 && lineStarts[hi + 1] < end) hi += 1;
    for (let i = lo; i <= hi; i += 1) mask[i] = true;
  }
  return mask;
}

function stripLabelBlockHints(block: string): string {
  return block
    .replace(HINT_SPAN_PATTERN, "")
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\s+$/, "");
}

/**
 * Derives the seeded, hint-free `templateMarkdown` from an authoring
 * template under packages/toolkit-content. Operates block-by-block
 * (blank-line-separated paragraphs), classifying each as a heading, table,
 * list, bold/list-item label, or plain prose:
 *  - headings and tables are never touched (no hint markup ever appears
 *    inside either in these templates);
 *  - a label block (`**Label:**` / `- Label:`) keeps its label and loses
 *    only a hint-derived value, so a real enumerated value like
 *    "Assumed / Interviewed / Prototyped / Paying" is untouched;
 *  - a list block drops a hint-bearing item's body down to its bare
 *    marker, never leaving a fragment behind;
 *  - any other block that contains a hint anywhere is dropped whole — this
 *    is what removes both free-standing hint paragraphs and hint-bearing
 *    bold sentences with no label structure of their own (the Five Whys
 *    heading-per-rung line, "Root cause emerges at Why <n>.").
 * Bare list-marker blocks that end up adjacent after their in-between
 * content is dropped (the Five Whys rungs) are rejoined with a single
 * newline rather than a blank line, matching how a tight list renders.
 */
function stripTemplateHints(raw: string): string {
  const trimmed = raw.trim();
  const lines = trimmed.split("\n");
  const hintMask = computeHintLineMask(trimmed, lines);

  const blockLineGroups: number[][] = [];
  let currentGroup: number[] = [];
  lines.forEach((line, index) => {
    if (line.trim().length === 0) {
      if (currentGroup.length > 0) {
        blockLineGroups.push(currentGroup);
        currentGroup = [];
      }
      return;
    }
    currentGroup.push(index);
  });
  if (currentGroup.length > 0) blockLineGroups.push(currentGroup);

  const kept: string[] = [];
  for (const lineIndexes of blockLineGroups) {
    const blockLines = lineIndexes.map((i) => lines[i]);
    const block = blockLines.join("\n");
    const blockHasHintLine = lineIndexes.some((i) => hintMask[i]);

    if (HEADING_PATTERN.test(block) || isTableBlock(block)) {
      kept.push(block);
      continue;
    }
    if (isListBlock(block)) {
      const stripped = blockLines
        .map((line, idx) => {
          if (!hintMask[lineIndexes[idx]]) return line;
          return LIST_ITEM_MARKER_PATTERN.exec(line)?.[0] ?? line;
        })
        .join("\n");
      kept.push(stripped);
      continue;
    }
    if (BOLD_LABEL_PATTERN.test(block) || LIST_ITEM_LABEL_PATTERN.test(block)) {
      kept.push(stripLabelBlockHints(block));
      continue;
    }
    if (!blockHasHintLine) {
      kept.push(block);
    }
    // else: whole block is dropped (free-standing hint paragraph, or a
    // hint-bearing sentence with no label/list structure of its own —
    // including one whose hint span crosses blank lines into what would
    // otherwise look like separate, hint-free blocks).
  }

  let result = "";
  kept.forEach((block, index) => {
    if (index === 0) {
      result = block;
      return;
    }
    const previous = kept[index - 1];
    const separator =
      isBareListMarkerBlock(previous) && isBareListMarkerBlock(block)
        ? "\n"
        : "\n\n";
    result += separator + block;
  });

  return `${result}\n`;
}

interface TemplateFixture {
  moduleKey: string;
  artifactKey: string;
  sourcePath: string;
}

const TEMPLATE_FIXTURES: TemplateFixture[] = [
  {
    moduleKey: "module-02-customer-avatar",
    artifactKey: "ideal_customer_avatar",
    sourcePath: "module-02-customer-avatar/templates/Ideal-Customer-Avatar.md",
  },
  {
    moduleKey: "module-03-problem-statement",
    artifactKey: "problem_statement",
    sourcePath: "module-03-problem-statement/templates/Problem-Statement.md",
  },
  {
    moduleKey: "module-03-problem-statement",
    artifactKey: "problem_interview_guide",
    sourcePath:
      "module-03-problem-statement/templates/Problem-Interview-Guide.md",
  },
  {
    moduleKey: "module-04-solution-statement",
    artifactKey: "north_star",
    sourcePath: "module-04-solution-statement/templates/North-Star.md",
  },
  {
    moduleKey: "module-04-solution-statement",
    artifactKey: "feature_benefit_map",
    sourcePath: "module-04-solution-statement/templates/Feature-Benefit-Map.md",
  },
];

// Artefacts with no validator of their own. They still must not drift from
// their authoring template, but the "skeleton fails its own draft check"
// test below is meaningless without rules to fail — a null validator_key
// carries an empty validationConfig by construction
// (validateConfigForValidator), so there is nothing for runDraftCheck to
// reject.
const UNVALIDATED_TEMPLATE_FIXTURES: TemplateFixture[] = [
  {
    moduleKey: "module-05-epics-user-stories",
    artifactKey: "epic_charter",
    sourcePath: "module-05-epics-user-stories/templates/Epic-Charter.md",
  },
  {
    moduleKey: "module-05-epics-user-stories",
    artifactKey: "sprint_backlog",
    sourcePath: "module-05-epics-user-stories/templates/Sprint-Backlog.md",
  },
  {
    moduleKey: "module-06-competitive-analysis",
    artifactKey: "competitive_landscape",
    sourcePath:
      "module-06-competitive-analysis/templates/Competitive-Landscape.md",
  },
  {
    moduleKey: "module-06-competitive-analysis",
    artifactKey: "defensible_position",
    sourcePath:
      "module-06-competitive-analysis/templates/Defensible-Position.md",
  },
  {
    moduleKey: "module-07-business-model",
    artifactKey: "business_model",
    sourcePath: "module-07-business-model/templates/Business-Model.md",
  },
  {
    moduleKey: "module-07-business-model",
    artifactKey: "pricing_strategy",
    sourcePath: "module-07-business-model/templates/Pricing-Strategy.md",
  },
];

function findArtifact(moduleKey: string, artifactKey: string) {
  const module = DEFAULT_TOOLKIT_CONTENT.modules.find(
    (m) => m.moduleKey === moduleKey,
  );
  if (!module) throw new Error(`no such module: ${moduleKey}`);
  const artifact = module.artifacts.find((a) => a.artifactKey === artifactKey);
  if (!artifact)
    throw new Error(`no such artifact: ${artifactKey} in ${moduleKey}`);
  return artifact;
}

describe("seeded templateMarkdown matches the authoring template with hints stripped", () => {
  for (const fixture of [
    ...TEMPLATE_FIXTURES,
    ...UNVALIDATED_TEMPLATE_FIXTURES,
  ]) {
    it(`${fixture.moduleKey} / ${fixture.artifactKey}`, () => {
      const artifact = findArtifact(fixture.moduleKey, fixture.artifactKey);
      const seededTemplate = (
        artifact.outputConfig as { templateMarkdown: string }
      ).templateMarkdown;
      const derivedTemplate = stripTemplateHints(
        readSourceFile(fixture.sourcePath),
      );
      expect(seededTemplate).toBe(derivedTemplate);
    });
  }
});

describe("the raw skeleton template fails its own artifact's draft validation", () => {
  for (const fixture of TEMPLATE_FIXTURES) {
    it(`${fixture.moduleKey} / ${fixture.artifactKey}`, () => {
      const artifact = findArtifact(fixture.moduleKey, fixture.artifactKey);
      const templateMarkdown = (
        artifact.outputConfig as { templateMarkdown: string }
      ).templateMarkdown;
      const context: ValidationContext = {
        content: templateMarkdown,
        responses: [],
        validationConfig: artifact.validationConfig,
      };
      const result = structuredMarkdownV1.runDraftCheck(context);
      expect(result.passed).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });
  }
});

// ---------------------------------------------------------------------------
// Prompt drift: the seeded facilitator/artifact-generator prompt content
// must equal the fenced ```markdown block following the matching "## 4."
// / "## 5." heading in the reviewed prompt set — the same extraction the
// content was originally ported with, re-run here as a check rather than
// a one-time transcription step.
// ---------------------------------------------------------------------------

function extractFencedBlockAfter(
  source: string,
  headingPrefix: string,
): string {
  const headingIndex = source.indexOf(headingPrefix);
  if (headingIndex === -1) {
    throw new Error(`heading "${headingPrefix}" not found`);
  }
  const after = source.slice(headingIndex);
  const match = /```markdown\n([\s\S]*?)\n```/.exec(after);
  if (!match) {
    throw new Error(
      `no fenced markdown block found after heading "${headingPrefix}"`,
    );
  }
  return match[1];
}

function promptContentByKey(promptKey: string): string {
  const prompt = PROMPTS_CONTENT.find((p) => p.promptKey === promptKey);
  if (!prompt) throw new Error(`no such prompt: ${promptKey}`);
  return prompt.content;
}

interface PromptFixture {
  promptKey: string;
  sourcePath: string;
  headingPrefix: string;
}

const PROMPT_FIXTURES: PromptFixture[] = [
  {
    promptKey: "customer_avatar_facilitator",
    sourcePath: "module-02-customer-avatar/prompts/module-02-prompt-set.md",
    headingPrefix: "## 4. Facilitator prompt",
  },
  {
    promptKey: "customer_avatar_artifact_generator",
    sourcePath: "module-02-customer-avatar/prompts/module-02-prompt-set.md",
    headingPrefix: "## 5. Artifact generator prompt",
  },
  {
    promptKey: "problem_statement_facilitator",
    sourcePath: "module-03-problem-statement/prompts/module-03-prompt-set.md",
    headingPrefix: "## 4. Facilitator prompt",
  },
  {
    promptKey: "problem_statement_artifact_generator",
    sourcePath: "module-03-problem-statement/prompts/module-03-prompt-set.md",
    headingPrefix: "## 5. Artifact generator prompt",
  },
  {
    promptKey: "solution_statement_facilitator",
    sourcePath: "module-04-solution-statement/prompts/module-04-prompt-set.md",
    headingPrefix: "## 4. Facilitator prompt",
  },
  {
    promptKey: "solution_statement_artifact_generator",
    sourcePath: "module-04-solution-statement/prompts/module-04-prompt-set.md",
    headingPrefix: "## 5. Artifact generator prompt",
  },
  // Module 1's facilitator is covered now. It previously could not be:
  // prompts.ts wrapped the summary-confirm block in a nested ``` fence,
  // which terminates this file's extractor early, while the Markdown
  // mirror indented it. The seeded copy was re-ported from the mirror so
  // both use indentation, the way Modules 2-4 always have.
  {
    promptKey: "pressure_test_facilitator",
    sourcePath: "module-01-pressure-test/prompts/module-01-prompt-set.md",
    headingPrefix: "## 4. Facilitator prompt",
  },
  {
    promptKey: "pressure_test_artifact_generator",
    sourcePath: "module-01-pressure-test/prompts/module-01-prompt-set.md",
    headingPrefix: "## 5. Artifact generator prompt",
  },
  {
    promptKey: "epics_user_stories_facilitator",
    sourcePath: "module-05-epics-user-stories/prompts/module-05-prompt-set.md",
    headingPrefix: "## 4. Facilitator prompt",
  },
  {
    promptKey: "epics_user_stories_artifact_generator",
    sourcePath: "module-05-epics-user-stories/prompts/module-05-prompt-set.md",
    headingPrefix: "## 5. Artifact generator prompt",
  },
  {
    promptKey: "competitive_analysis_facilitator",
    sourcePath:
      "module-06-competitive-analysis/prompts/module-06-prompt-set.md",
    headingPrefix: "## 4. Facilitator prompt",
  },
  {
    promptKey: "competitive_analysis_artifact_generator",
    sourcePath:
      "module-06-competitive-analysis/prompts/module-06-prompt-set.md",
    headingPrefix: "## 5. Artifact generator prompt",
  },
  {
    promptKey: "business_model_facilitator",
    sourcePath: "module-07-business-model/prompts/module-07-prompt-set.md",
    headingPrefix: "## 4. Facilitator prompt",
  },
  {
    promptKey: "business_model_artifact_generator",
    sourcePath: "module-07-business-model/prompts/module-07-prompt-set.md",
    headingPrefix: "## 5. Artifact generator prompt",
  },
];

describe("seeded prompt content matches the reviewed prompt set", () => {
  for (const fixture of PROMPT_FIXTURES) {
    it(fixture.promptKey, () => {
      const expected = extractFencedBlockAfter(
        readSourceFile(fixture.sourcePath),
        fixture.headingPrefix,
      );
      expect(promptContentByKey(fixture.promptKey)).toBe(expected);
    });
  }
});
