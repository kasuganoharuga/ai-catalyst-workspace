import type { ModuleContextQuestion } from "@ai-catalyst/shared";

import {
  MODULE_1_KEY,
  MODULE_2_KEY,
  MODULE_3_KEY,
  MODULE_4_KEY,
} from "./module-display";

// Module 2 progress uses eight founder-facing conversation blocks (see
// module-02-prompt-set.md §1–2), not `questionGroup` — that field maps
// artefact sections and mis-orders the work-step list when blocks save
// multiple fields together.
const MODULE_2_QUESTION_BLOCKS: {
  group: string;
  label: string;
  questionKeys: string[];
}[] = [
  {
    group: "who_and_buyer",
    label: "Who the customer is and who buys",
    questionKeys: ["customer_picture", "beachhead_segment"],
  },
  {
    group: "where_and_moment",
    label: "Where they are, and what they're moving towards",
    questionKeys: ["customer_where", "commercial_moment"],
  },
  {
    group: "situation",
    label: "The moment the problem becomes urgent",
    questionKeys: ["customer_situation"],
  },
  {
    group: "unmet_needs",
    label: "What they need but cannot get today",
    questionKeys: ["functional_needs", "emotional_needs"],
  },
  {
    group: "buying_signals",
    label:
      "What they do without you, what shows real intent, and what's coming",
    questionKeys: ["current_alternatives", "tier1_signals", "tier2_signals"],
  },
  {
    group: "disqualifiers",
    label: "Who to leave out, and why",
    questionKeys: ["disqualifiers"],
  },
  {
    group: "core_promise",
    label: "What they are actually buying",
    questionKeys: ["core_promise"],
  },
  {
    group: "validation",
    label: "How much of this is evidenced, not assumption",
    questionKeys: ["validation_status"],
  },
];

// Module 3's Block 2 is a fixed five-step Five Whys script that resolves
// four fields in one confirmation (see module-03-prompt-set.md §1-2) —
// grouped here the same way Module 2 groups its multi-field blocks, so the
// work-step list shows three steps, not six.
const MODULE_3_QUESTION_BLOCKS: {
  group: string;
  label: string;
  questionKeys: string[];
}[] = [
  {
    group: "problem_draft",
    label: "The problems, ranked most to least severe",
    questionKeys: ["problem_draft"],
  },
  {
    group: "five_whys",
    label: "Why it happens, the root cause, and how urgent it is",
    questionKeys: [
      "five_whys_ladder",
      "root_cause",
      "problem_statement",
      "priority_evidence",
    ],
  },
  {
    group: "validation",
    label: "How much of this is evidenced, not assumption",
    questionKeys: ["validation_status"],
  },
];

/**
 * Short phrases standing in for each Question's full `question_text`.
 * Keyed by Module because the same key can mean different things in
 * different Modules (`validation_status` in both 2 and 3). The assistant
 * asks the real question one at a time; these only have to be
 * recognisable at a glance.
 */
const QUESTION_LABELS: Record<string, Record<string, string>> = {
  [MODULE_1_KEY]: {
    idea_one_sentence: "Your idea in one sentence",
    target_customer: "Who the customer really is",
    customer_problem: "The problem it solves for them",
    business_model: "How the idea makes money",
    current_stage: "Where the idea stands today",
    competitors_alternatives: "What they use instead today",
  },
  [MODULE_3_KEY]: {
    problem_draft: "Your first take on the problem",
    five_whys_ladder: "The five whys, one layer at a time",
    root_cause: "The structural root cause underneath",
    problem_statement: "The problem in one clear statement",
    priority_evidence: "Why it is a priority, not a nice-to-have",
    validation_status: "How much of this is evidence, not assumption",
  },
  [MODULE_4_KEY]: {
    product_definition: "The category, and who this is for",
    differentiator: "The structural reason this wins",
    north_star_statement: "The solution in one sentence",
    feature_brain_dump: "Every feature on the table",
    most_valuable_features: "The three worth building first",
    feature_benefits: "What each one does for them",
    desirability_order: "The order they would want them",
    assumption_risks: "What evidence validates, and what is still assumed",
  },
};

/** One row in a Module's simplified work-step progress list — a short phrase, never the full question text. */
export interface ModuleQuestionDisplayGroup {
  key: string;
  label: string;
  done: boolean;
}

/** Fallback for a Question with no curated phrase: "idea_one_sentence" -> "Idea one sentence". */
function humanizeQuestionKey(questionKey: string): string {
  const [first, ...rest] = questionKey.split("_");
  if (!first) {
    return questionKey;
  }
  return [first[0].toUpperCase() + first.slice(1), ...rest].join(" ");
}

// Modules whose founder-facing blocks resolve more than one field at once —
// the work-step list groups by block instead of by question, or a
// multi-field confirm would show as several separate steps.
const QUESTION_BLOCKS_BY_MODULE: Record<
  string,
  { group: string; label: string; questionKeys: string[] }[]
> = {
  [MODULE_2_KEY]: MODULE_2_QUESTION_BLOCKS,
  [MODULE_3_KEY]: MODULE_3_QUESTION_BLOCKS,
};

/**
 * Simplified rows for a Module's work-step progress list. Modules 2 and 3
 * collapse to their founder-facing blocks (see `QUESTION_BLOCKS_BY_MODULE`);
 * every other Module gets one row per Question. Either way the row carries
 * a short phrase, not the full `questionText` sentence.
 */
export function buildQuestionDisplayGroups(
  moduleKey: string,
  questions: ModuleContextQuestion[],
): ModuleQuestionDisplayGroup[] {
  const blocks = QUESTION_BLOCKS_BY_MODULE[moduleKey];
  if (blocks) {
    const questionByKey = new Map(
      questions.map((question) => [question.questionKey, question]),
    );
    return blocks.map((block) => {
      const blockQuestions = block.questionKeys
        .map((key) => questionByKey.get(key))
        .filter(
          (question): question is ModuleContextQuestion =>
            question !== undefined,
        );
      return {
        key: block.group,
        label: block.label,
        done:
          blockQuestions.length > 0 &&
          blockQuestions.every((question) => question.responseStatus !== null),
      };
    });
  }
  const labels = QUESTION_LABELS[moduleKey] ?? {};
  return questions.map((question) => ({
    key: question.questionKey,
    label:
      labels[question.questionKey] ?? humanizeQuestionKey(question.questionKey),
    done: question.responseStatus !== null,
  }));
}
