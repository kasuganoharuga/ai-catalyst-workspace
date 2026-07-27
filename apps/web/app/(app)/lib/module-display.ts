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
 * Default (no prompt): project home — preferred for "Open your project" so
 * the Founder lands in the saved project rather than a prefilled `/new` chat
 * that can feel like a separate thread. Optional `prompt` still builds
 * `/new?project=…&q=…` for callers that explicitly want a prefilled composer.
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

/**
 * Claude's connector page, desktop first.
 *
 * `/customize/connectors`, not `/settings/connectors`: Claude moved
 * connectors out of Settings and into Customize, and the old path now
 * lands on a "these have moved" notice. The desktop deep link is
 * confirmed to open the client.
 *
 * Linking straight here is also what lets the steps beside it stop
 * describing a menu route. Naming each click (avatar, then Settings, then
 * Connectors) meant the instructions broke the moment Anthropic
 * rearranged their own UI — and broke silently, in a way that reads to a
 * founder like the feature is missing rather than moved.
 */
export const CLAUDE_CONNECTOR_SETTINGS_DESKTOP_URL =
  "claude://claude.ai/customize/connectors";

export const CLAUDE_CONNECTOR_SETTINGS_URL =
  "https://claude.ai/customize/connectors";

/**
 * Opens Claude Desktop on a new chat with a prefilled composer
 * (`claude://claude.ai/new?q=…` — see Anthropic's Desktop deep-link docs).
 */
export function claudeDesktopChatUrl(prompt: string): string {
  return `claude://claude.ai/new?q=${encodeURIComponent(prompt)}`;
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
    "Please talk me through connecting my AI Catalyst Founder Toolkit to Claude as a custom remote MCP connector. I'll do the clicking — you can't reach these settings yourself.",
    "",
    "The steps are:",
    "1. Open my connectors — they're under Customize, at claude.ai/customize/connectors",
    "2. Add a custom connector",
    '3. Name it "AI Catalyst" and paste this as the URL:',
    urlBlock,
    "4. Open the link Claude shows, then sign in and approve in the browser",
    "5. Set the tools to always allow",
    "",
    "Take them one at a time and wait for me. If a screen doesn't match what you described, help me work out what I'm looking at — this page has moved before, so trust what I can see over the exact wording above.",
    "",
    "Two things that stop people here, so check them with me if I get stuck: custom connectors need a paid Claude plan and don't appear on Free, and on a Team or Enterprise plan only the workspace owner can add one.",
    "",
    "Don't tell me the connector is connected — you have no way to see that. The AI Catalyst website detects it and moves me on by itself.",
  ].join("\n");
}

export function startModulePrompt(moduleTitle: string): string {
  return `Let's work on "${moduleTitle}" from my AI Catalyst Founder Toolkit. Please pick up wherever I left off.`;
}
