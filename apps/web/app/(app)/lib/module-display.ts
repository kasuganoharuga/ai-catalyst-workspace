import type {
  ModuleAttemptStatus,
  ModuleContextQuestion,
  RunModuleStatus,
} from "@ai-catalyst/shared";

// Presentation-only: maps run/attempt states to labels and colours (logic stays in services).

// Content-stable module keys from content-seed — V1 status UI knows these by name.
export const MODULE_0_KEY = "module-00-setup";
export const MODULE_1_KEY = "module-01-pressure-test";
export const MODULE_2_KEY = "module-02-customer-avatar";
export const MODULE_3_KEY = "module-03-problem-statement";
export const MODULE_4_KEY = "module-04-evidence-of-unmet-need";

// Module 1 decision-stage keys — shown as "Your decision", not counted with the six questions.
// Includes legacy v1 keys so older program versions still render.
export const DECISION_QUESTION_KEYS = new Set([
  "founder_decision",
  "pivot_detail",
  "initial_decision",
  "final_decision",
]);

/**
 * Module 2's thirteen `module_questions` rows are the Facilitator's
 * per-field save points, but the founder-facing conversation runs as
 * eight blocks (see content-seed/content/module-2.ts's `questionGroup`
 * values) — this mirrors that grouping so the progress UI can say "eight
 * blocks", matching resolveModuleCopy's questionsLabel, instead of
 * thirteen individual fields.
 */
const MODULE_2_QUESTION_BLOCKS: {
  group: string;
  label: string;
  questionKeys: string[];
}[] = [
  {
    group: "snapshot",
    label: "Who they are, where they are, and what they are moving towards",
    questionKeys: [
      "customer_picture",
      "customer_where",
      "customer_stage",
      "commercial_moment",
    ],
  },
  {
    group: "segment",
    label: "The beachhead segment you start with",
    questionKeys: ["beachhead_segment"],
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
    label: "The signs they are ready to act",
    questionKeys: ["tier1_signals", "tier2_signals"],
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
    label: "How much of this is evidence, not assumption",
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
    current_alternatives: "What they use instead today",
    five_whys_ladder: "The five whys, one layer at a time",
    root_cause: "The structural root cause underneath",
    problem_statement: "The problem in one clear statement",
    pain_intensity: "How much this hurts them today",
    priority_evidence: "Why it is a priority, not a nice-to-have",
    validation_status: "How much of this is evidence, not assumption",
  },
  [MODULE_4_KEY]: {
    evidence_additions: "What the interviews actually returned",
    evidence_level: "The evidence level you have reached",
    evidence_level_reasoning: "Why that level and not a higher one",
    observed_behaviour: "What customers did, not what they said",
    strongest_counterargument: "The strongest case against you",
    counterargument_defence: "Your honest answer to that case",
    validation_constraints: "The time, money and access you have",
  },
};

/**
 * The Artifact a Module is summarised by — what "Produces …" names on the
 * catalog card and what the dashboard tracks as saved/not saved.
 *
 * Not `artifacts[0]`. A Module can hold a supporting Artifact it accepts
 * but never blocks on (Module 4's Interview Notes, which is `isRequired:
 * false` and — being the first thing that happens in that Module — sorts
 * first), and an inbound record is not what a Module produces. The first
 * *required* Artifact is, so ordering the Artifacts by when they happen no
 * longer changes what the Module is called by. Falls back to the first of
 * any kind so a Module with only optional Artifacts still summarises.
 */
export function headlineArtifact<T extends { isRequired: boolean }>(
  artifacts: readonly T[],
): T | null {
  return (
    artifacts.find((artifact) => artifact.isRequired) ?? artifacts[0] ?? null
  );
}

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

/**
 * The Artifact whose saved version is the only proof the platform has that
 * a Module's off-platform prerequisite was met. Module 4's facilitator
 * saves `Interview-Notes.md` in Block 1, before any Response, and re-reads
 * it from storage for every later block — so a saved version of that file
 * means the interviews genuinely reached the platform.
 *
 * Not the `evidence_additions` Response, which this used to check: the
 * facilitator explicitly accepts "Nothing to add" as a complete answer to
 * that field, so it can be answered without any notes existing, and the
 * row would go green on a Module that had not met its prerequisite at all.
 */
const PREREQUISITE_ARTIFACT_KEY: Record<string, string> = {
  [MODULE_4_KEY]: "interview_notes",
};

/**
 * Null for a Module with no off-platform prerequisite. Callers use it to
 * keep the prerequisite Artifact out of the "documents this Module
 * produces" list — it has its own row, and it is an inbound record rather
 * than an output.
 */
export function prerequisiteArtifactKey(moduleKey: string): string | null {
  return PREREQUISITE_ARTIFACT_KEY[moduleKey] ?? null;
}

/** False for a Module with no prerequisite — the row is copy-gated, not shown at all. */
export function isWorkPrerequisiteMet(
  moduleKey: string,
  artifacts: { artifactKey: string; versionNumber: number | null }[],
): boolean {
  const artifactKey = prerequisiteArtifactKey(moduleKey);
  if (!artifactKey) {
    return false;
  }
  return artifacts.some(
    (artifact) =>
      artifact.artifactKey === artifactKey && artifact.versionNumber !== null,
  );
}

/**
 * Simplified rows for a Module's work-step progress list. Module 2
 * collapses to its eight founder-facing blocks; every other Module gets
 * one row per Question. Either way the row carries a short phrase, not
 * the full `questionText` sentence.
 */
export function buildQuestionDisplayGroups(
  moduleKey: string,
  questions: ModuleContextQuestion[],
): ModuleQuestionDisplayGroup[] {
  if (moduleKey === MODULE_2_KEY) {
    const questionByKey = new Map(
      questions.map((question) => [question.questionKey, question]),
    );
    return MODULE_2_QUESTION_BLOCKS.map((block) => {
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

// How many --module-accent-N vars globals.css defines; indices wrap past seven modules.
const MODULE_ACCENT_COUNT = 7;

/** Inline style for a module number badge — dynamic index, not a static Tailwind class. */
export function moduleAccentStyle(sequenceIndex: number): {
  backgroundColor: string;
} {
  const index =
    ((sequenceIndex % MODULE_ACCENT_COUNT) + MODULE_ACCENT_COUNT) %
    MODULE_ACCENT_COUNT;
  return { backgroundColor: `var(--module-accent-${index})` };
}

// Fill treatments, not hues — see status-badge.tsx. "module" resolves to the module accent at render time.
export type StatusTone =
  "muted" | "outline" | "lime" | "soft" | "ink" | "module" | "warning";

export interface ModuleDisplayStatus {
  label: string;
  tone: StatusTone;
}

const RUN_STATUS_DISPLAY: Record<RunModuleStatus, ModuleDisplayStatus> = {
  locked: { label: "Locked", tone: "muted" },
  inherited: { label: "Carried over", tone: "muted" },
  available: { label: "Ready to start", tone: "outline" },
  in_progress: { label: "In progress", tone: "lime" },
  ready_to_unlock: { label: "Almost there", tone: "outline" },
  completed: { label: "Completed", tone: "module" },
};

/** Attempt statuses that clear active_attempt_id and need a Retry to write again. */
const RETRYABLE_DISPLAY_STATUSES = new Set<ModuleAttemptStatus>([
  "validation_failed",
  "rejected",
  "cancelled",
]);

/** Module is startable but has no active attempt in a retryable terminal state. */
export function needsModuleRetry(
  runStatus: RunModuleStatus,
  activeAttemptStatus: ModuleAttemptStatus | null | undefined,
  displayAttemptStatus: ModuleAttemptStatus | null | undefined,
): boolean {
  if (runStatus !== "available" && runStatus !== "in_progress") {
    return false;
  }
  if (activeAttemptStatus) {
    return false;
  }
  return (
    displayAttemptStatus != null &&
    RETRYABLE_DISPLAY_STATUSES.has(displayAttemptStatus)
  );
}

/**
 * Label for a module's current state. Active attempt status refines coarse run status
 * where it matters. Pass display attempt status when active_attempt_id is cleared.
 */
export function deriveModuleDisplayStatus(
  runStatus: RunModuleStatus,
  activeAttemptStatus: ModuleAttemptStatus | null | undefined,
  displayAttemptStatus?: ModuleAttemptStatus | null,
): ModuleDisplayStatus {
  if (runStatus === "in_progress") {
    const attemptStatus = activeAttemptStatus ?? displayAttemptStatus ?? null;
    if (attemptStatus === "ready_for_review") {
      return { label: "Ready for review", tone: "ink" };
    }
    if (attemptStatus === "validation_failed") {
      return { label: "Needs another go", tone: "warning" };
    }
    if (attemptStatus === "rejected" || attemptStatus === "cancelled") {
      return { label: "Needs another go", tone: "warning" };
    }
    if (attemptStatus === "submitted") {
      return { label: "Checking your work", tone: "soft" };
    }
  }
  return RUN_STATUS_DISPLAY[runStatus];
}

/** Opens a fresh Claude chat with a prefilled starter message. */
export function claudeChatUrl(prompt: string): string {
  return `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
}

/**
 * Desktop deep link to a Claude Chat Project. Cannot combine project + prompt —
 * use claudeChatProjectWebUrl when both are needed.
 */
export function claudeChatProjectUrl(projectId: string): string {
  return `claude://claude.ai/project/${projectId}`;
}

/** Browser URL into a Claude Chat Project. Optional prompt builds /new?project=…&q=…. */
export function claudeChatProjectWebUrl(
  projectId: string,
  prompt?: string,
): string {
  if (prompt) {
    return `https://claude.ai/new?project=${encodeURIComponent(projectId)}&q=${encodeURIComponent(prompt)}`;
  }
  return `https://claude.ai/project/${projectId}`;
}

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Extract project id from a pasted URL or bare UUID. Returns null if none found. */
export function extractClaudeProjectId(input: string): string | null {
  const match = input.trim().match(UUID_PATTERN);
  return match ? match[0].toLowerCase() : null;
}

// /customize/connectors — not /settings/connectors; no menu route in copy (UI moves break it).
export const CLAUDE_CONNECTOR_SETTINGS_DESKTOP_URL =
  "claude://claude.ai/customize/connectors";

export const CLAUDE_CONNECTOR_SETTINGS_URL =
  "https://claude.ai/customize/connectors";

/** Opens Claude Desktop with a prefilled composer (claude://claude.ai/new?q=…). */
export function claudeDesktopChatUrl(prompt: string): string {
  return `claude://claude.ai/new?q=${encodeURIComponent(prompt)}`;
}

// ── ChatGPT ─────────────────────────────────────────────────────────────

/**
 * As far as this deep link goes. The scheme opens the settings window but
 * cannot address the Plugins page or the MCPs tab inside it, so the manual
 * steps carry the founder from there.
 */
export const CHATGPT_SETTINGS_DESKTOP_URL = "codex://settings";

/**
 * Opens the desktop app, nothing more. There is deliberately no browser
 * equivalent anywhere in the ChatGPT flow: the MCP server is registered in
 * the desktop app, so a chat at chatgpt.com cannot reach this workspace and
 * sending a founder there would produce an assistant that denies the
 * workspace exists.
 */
export const CHATGPT_APP_URL = "codex://";

/**
 * Opens the desktop app with a prefilled composer — confirmed against
 * OpenAI's own command reference and cross-checked against a reverse
 * engineering of the app bundle (both describe `prompt=` on `codex://new`
 * as populating the chat box without sending it, the same "ready to send,
 * not sent" contract `claudeDesktopChatUrl` relies on). `codex://settings`
 * above is the same scheme family and is already known to work, which is
 * the strongest signal available that this one does too.
 *
 * No browser fallback, same reasoning as CHATGPT_APP_URL: nothing at
 * chatgpt.com can reach this workspace's MCP connector.
 */
export function chatgptDesktopChatUrl(prompt: string): string {
  return `codex://new?prompt=${encodeURIComponent(prompt)}`;
}

export function startModulePrompt(moduleTitle: string): string {
  return `Let's work on "${moduleTitle}" from my AI Catalyst Founder Toolkit. Please pick up wherever I left off.`;
}
