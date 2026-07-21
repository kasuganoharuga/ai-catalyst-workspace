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
// Includes legacy v1 keys (initial_decision / final_decision) so older
// program versions still render correctly in the UI.
export const DECISION_QUESTION_KEYS = new Set([
  "founder_decision",
  "pivot_detail",
  "initial_decision",
  "final_decision",
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

/** Attempt statuses that clear active_attempt_id and need a Retry to write again. */
const RETRYABLE_DISPLAY_STATUSES = new Set<ModuleAttemptStatus>([
  "validation_failed",
  "rejected",
  "cancelled",
]);

/**
 * True when the Module is startable but has no active Attempt, and the
 * display Attempt is in a retryable terminal state — Claude cannot save
 * until the Founder opens a fresh Attempt.
 */
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
 * The one label shown for a Module's current state. The active Attempt's
 * status refines the coarse Run-module status where the difference matters
 * to a Founder: "in progress" reads very differently from "waiting on your
 * mentor" or "needs another pass".
 *
 * When activeAttemptId is cleared after validation_failed, pass the
 * display Attempt's status as the third argument so the badge still reads
 * "Needs another pass" instead of a bare "In progress".
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
      return { label: "Needs another pass", tone: "warning" };
    }
    if (attemptStatus === "rejected" || attemptStatus === "cancelled") {
      return { label: "Needs another pass", tone: "warning" };
    }
    if (attemptStatus === "submitted") {
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

/**
 * Desktop deep link that opens a Claude Chat Project home.
 *
 * Claude Desktop's `claude://` handler does not combine project + prompt:
 * `/project/{id}` ignores `q=`, and `/new?q=` ignores `project=`. Use
 * `claudeChatProjectWebUrl` when the Founder needs both (HTTPS `/new`
 * supports `project` + `q` together).
 */
export function claudeChatProjectUrl(projectId: string): string {
  return `claude://claude.ai/project/${projectId}`;
}

/**
 * Browser URL into a Claude Chat Project.
 *
 * With a prompt: `/new?project=…&q=…` opens a new chat in that project with
 * the composer prefilled. Without a prompt: project home only.
 */
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

/**
 * Opens Claude Desktop on a new chat with a prefilled composer
 * (`claude://claude.ai/new?q=…` — see Anthropic's Desktop deep-link docs).
 */
export function claudeDesktopChatUrl(prompt: string): string {
  return `claude://claude.ai/new?q=${encodeURIComponent(prompt)}`;
}

/** Opens Claude Desktop Cowork with a prefilled composer (`claude://` deep link). */
export function claudeCoworkUrl(prompt: string): string {
  return `claude://cowork/new?q=${encodeURIComponent(prompt)}`;
}

/**
 * Prefill text that asks Claude to walk the Founder through adding this
 * workspace as a custom remote MCP connector. The Founder still has to
 * approve the OAuth consent screen — Claude can open the UI and paste the
 * URL, but it cannot grant access on their behalf.
 */
export function mcpConnectPrompt(endpointUrl: string | null): string {
  const urlBlock = endpointUrl
    ? endpointUrl
    : "(copy the workspace address from my AI Catalyst connection page)";
  return [
    "Please help me connect my AI Catalyst Founder Toolkit to Claude as a custom remote MCP connector.",
    "",
    "Walk me through these steps in Claude:",
    "1. Open Settings → Connectors → Add custom connector",
    "2. Paste this as the remote MCP server URL:",
    urlBlock,
    '3. Name it something like "AI Catalyst"',
    "4. When Claude asks me to sign in and approve access, I'll complete that step",
    "",
    "Guide me through any screens I see, then tell me when the connector is connected so I can continue.",
  ].join("\n");
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

1. USE THE CONNECTOR, DON'T GUESS. Call list_modules before saying anything about where I'm up to. Call get_module_context before starting or resuming a module. Follow any facilitator / artifact_generator prompts returned in that context — they are the module's interview script. My real state lives in the workspace, not in this conversation's memory.

2. SAVE WHEN THE MODULE SAYS SO. Follow the module prompt for when to call save_founder_input (Module 1 collects answers first, then saves after a summary confirm — do not save each answer mid-interview). Save documents with save_artifact only when the final artefact is ready, then call complete_module. If a save fails, tell me immediately and stop — never carry on as though it worked. If complete_module returns validationErrors, repair those named gaps.

3. ONE QUESTION AT A TIME. Ask a module's questions one at a time and wait for my answer. Never fill one in on my behalf. End-of-set summary confirmation (when the module prompt requires it) is allowed before saving.

4. EXPLAIN YOUR REASONING — IN VERDICTS AND RECOMMENDATIONS. For every recommendation, ranking or score, walk through the reasoning: what alternatives you considered, why you picked this one, and what assumption would make you wrong. Do not critique or pressure-test during collect-only question phases.

5. ARGUE AGAINST YOURSELF — IN VERDICTS. Before delivering a verdict or recommendation, show the strongest case against it. During collect-only Q&A, do not introduce new business questions.

6. SEPARATE EVIDENCE FROM ASSUMPTION. When I describe customers, problems, numbers or competitors, say explicitly which parts are evidence and which are assumptions — especially in saved documents. Never let an assumption into a saved document dressed up as a fact.

7. DON'T REPLACE REAL CUSTOMER CONVERSATIONS. You are a thinking partner, not a substitute for talking to people. Whenever I claim what customers want, will pay, or will do without an actual conversation behind it, name it as an assumption and tell me who to speak to, what to ask, and what would count as enough — in the verdict, not by derailing the interview.

8. STAY IN ROLE. A module may put you in a specific role. Hold it for the rest of that module unless I tell you to switch.

9. DON'T MAKE ME REPEAT MYSELF. My earlier answers and documents are already in the workspace. Retrieve them through the connector instead of asking me to paste them again. If activeAttemptId is null but displayAttempt has answers, use those — validation failure clears the active pointer; it does not delete my answers. After a failed Attempt, call start_module_attempt without inventing basedOnAttemptId — the Service starts the Retry. A fresh empty Retry still surfaces prior answers on displayAttempt; re-save into the new active Attempt after I confirm.

10. DON'T MOVE ME ON. When a module's output is saved and has passed its checks, tell me to confirm it on the AI Catalyst website. You cannot unlock the next module — that decision is mine to make.

Confirm you've understood these before we start.`;
}
