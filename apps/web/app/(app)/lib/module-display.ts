import type { ModuleAttemptStatus, RunModuleStatus } from "@ai-catalyst/shared";

// Presentation-only mapping from the Run/Attempt state machines to what a
// Founder should read on screen. Pure and server-safe — no business rules
// live here (those stay in packages/services); this only picks words and
// colours for states the Services have already decided.

// Content-stable module keys from the seeded program content
// (packages/services/src/content-seed/content) — the two Modules the V1
// status UI knows by name.
export const MODULE_0_KEY = "module-00-setup";
export const MODULE_1_KEY = "module-01-pressure-test";

// Module 1's decision-stage question keys (content-seed module-1.ts) —
// shown as "Your decision" rather than counted alongside the six core
// questions, in both the checklist and the run panel's progress line.
export const DECISION_QUESTION_KEYS = new Set([
  "initial_decision",
  "final_decision",
  "pivot_detail",
]);

// How many --module-accent-N custom properties globals.css defines.
// Indices wrap, so the programme can grow past seven modules without a
// code change — module 7 simply reuses module 0's hue.
const MODULE_ACCENT_COUNT = 7;

/**
 * Background for a module's number badge — the single element allowed to
 * carry a module's identity colour. Returned as an inline style rather
 * than a class because the index is dynamic and Tailwind can only see
 * class names it can read statically.
 */
export function moduleAccentStyle(sequenceIndex: number): {
  backgroundColor: string;
} {
  const index =
    ((sequenceIndex % MODULE_ACCENT_COUNT) + MODULE_ACCENT_COUNT) %
    MODULE_ACCENT_COUNT;
  return { backgroundColor: `var(--module-accent-${index})` };
}

// Fill treatments, not hues — see components/status-badge.tsx for why.
// "module" is the exception: it resolves to the module's own accent at
// render time, which is why StatusBadge needs the module index for it.
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

/**
 * The one label shown for a Module's current state. The active Attempt's
 * status refines the coarse Run-module status where the difference matters
 * to a Founder: "in progress" reads very differently from "waiting on your
 * mentor" or "needs another pass".
 */
export function deriveModuleDisplayStatus(
  runStatus: RunModuleStatus,
  activeAttemptStatus: ModuleAttemptStatus | null | undefined,
): ModuleDisplayStatus {
  if (runStatus === "in_progress") {
    if (activeAttemptStatus === "ready_for_review") {
      return { label: "Ready for review", tone: "ink" };
    }
    if (activeAttemptStatus === "validation_failed") {
      return { label: "Needs another pass", tone: "warning" };
    }
    if (activeAttemptStatus === "submitted") {
      return { label: "Checking your work", tone: "soft" };
    }
  }
  return RUN_STATUS_DISPLAY[runStatus];
}

/**
 * Deep link that opens a fresh Claude chat with a starter message filled
 * in. The connector does the rest — no Skill download, no copy-pasted
 * instructions.
 */
export function claudeChatUrl(prompt: string): string {
  return `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
}

/** Deep link to an existing Claude Chat Project (Desktop or browser handler). */
export function claudeChatProjectUrl(projectId: string): string {
  return `claude://claude.ai/project/${projectId}`;
}

/** Browser URL for the same Claude Chat Project. */
export function claudeChatProjectWebUrl(projectId: string): string {
  return `https://claude.ai/project/${projectId}`;
}

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Pulls the project id out of whatever the Founder actually pasted.
 *
 * The service stores a bare UUID, but nobody copies a bare UUID — they
 * copy the address bar. Accepting the full URL (and a bare id, for
 * anyone who does trim it) means the honest action of "paste what I
 * copied" works, instead of being rejected for containing a prefix we
 * could have stripped ourselves. Returns null when there's no id in
 * there at all, so the caller can say so before a round trip.
 */
export function extractClaudeProjectId(input: string): string | null {
  const match = input.trim().match(UUID_PATTERN);
  return match ? match[0].toLowerCase() : null;
}

export const CLAUDE_CONNECTOR_SETTINGS_URL =
  "https://claude.ai/settings/connectors";

/** Opens Claude Desktop Cowork with a prefilled composer (`claude://` deep link). */
export function claudeCoworkUrl(prompt: string): string {
  return `claude://cowork/new?q=${encodeURIComponent(prompt)}`;
}

export function mcpConnectCoworkPrompt(endpointUrl: string | null): string {
  const addressLine = endpointUrl
    ? `Use this MCP address: ${endpointUrl}`
    : "Use the workspace address from my AI Catalyst connection page.";
  return `Help me connect my AI Catalyst Founder Toolkit. In Claude, open Settings → Connectors → Add custom connector. ${addressLine}`;
}

export function startModulePrompt(moduleTitle: string): string {
  return `Let's work on "${moduleTitle}" from my AI Catalyst Founder Toolkit. Please pick up wherever I left off.`;
}

/**
 * Project instructions the Founder pastes into their Claude project once,
 * at Module 0. A Claude project keeps them attached to every future chat,
 * which is what stops each module starting cold.
 *
 * Written in the Founder's voice ("my toolkit", "ask me") because that is
 * whose project it is — Claude reads these as standing instructions from
 * its user.
 *
 * The last paragraph is the important one: it tells Claude that unlocking
 * is not its call. The service layer enforces that regardless
 * (confirmModuleCompletion is website-only), but a model that knows the
 * rule won't tell the Founder it has moved them on when it hasn't.
 */
export function claudeProjectInstructions(): string {
  return `You are working with me through the AI Catalyst Founder Toolkit. We work module by module, and each module leaves behind an artefact the next one builds on.

Rules for every turn in this project:

1. USE THE CONNECTOR, DON'T GUESS. Call list_modules before saying anything about where I'm up to. Call get_module_context before starting or resuming a module. My real state lives in the workspace, not in this conversation's memory.

2. SAVE AS WE GO. Save each answer with save_founder_input the moment I give it. Save documents with save_artifact, then call complete_module when a module's output is finished. Everything lands in my workspace storage. If a save fails, tell me immediately and stop — never carry on as though it worked.

3. ONE QUESTION AT A TIME. Ask a module's questions one at a time and wait for my answer. Never batch them, and never fill one in on my behalf.

4. EXPLAIN YOUR REASONING. For every recommendation, ranking or score, walk through the reasoning before the answer: what alternatives you considered, why you picked this one, and what assumption would make you wrong. No platitudes, no "great idea!" filler. If something is mediocre, say so.

5. ARGUE AGAINST YOURSELF. Before delivering any output, ask yourself what the strongest case against it is — and show me that case, not just the polished version. I'd rather hear where this could be wrong than get a confident wrong answer.

6. SEPARATE EVIDENCE FROM ASSUMPTION. When I describe customers, problems, numbers or competitors, push for specifics. Say explicitly which parts are evidence and which are assumptions. Never let an assumption into a saved document dressed up as a fact.

7. DON'T REPLACE REAL CUSTOMER CONVERSATIONS. You are a thinking partner, not a substitute for talking to people. Whenever I claim what customers want, will pay, or will do without an actual conversation behind it, name it as an assumption and tell me who to speak to, what to ask, and what would count as enough. Founders who win think clearly with AI AND learn from real people.

8. STAY IN ROLE. A module may put you in a specific role — a brutally honest investor, for instance. Hold it for the rest of that module unless I tell you to switch.

9. DON'T MAKE ME REPEAT MYSELF. My earlier answers and documents are already in the workspace. Retrieve them through the connector instead of asking me to paste them again. If something genuinely isn't there, name the document you expected.

10. DON'T MOVE ME ON. When a module's output is saved and has passed its checks, tell me to confirm it on the AI Catalyst website. You cannot unlock the next module — that decision is mine to make.

Confirm you've understood these before we start.`;
}
